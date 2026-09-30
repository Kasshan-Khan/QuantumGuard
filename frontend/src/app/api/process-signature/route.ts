import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { ethers } from 'ethers';
import { PDFDocument } from 'pdf-lib';

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

const withRetry = async (fn: () => Promise<any>, retries = 3, delayMs = 1500) => {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e: any) {
      if (i === retries - 1) throw e;
      if (e.code === 'P1001' || e.message?.includes("Can't reach database server")) {
        console.warn('DB cold-start, retrying attempt ' + (i + 1));
        await new Promise(r => setTimeout(r, delayMs));
      } else { throw e; }
    }
  }
  throw new Error('Unreachable');
};

export async function POST(req: NextRequest) {
  try {
    const ip_address = req.headers.get('x-forwarded-for') || '127.0.0.1';

    const now = Date.now();
    const rateData = rateLimitMap.get(ip_address);
    if (rateData) {
      if (now - rateData.timestamp < RATE_LIMIT_WINDOW_MS) {
        if (rateData.count >= MAX_REQUESTS_PER_WINDOW)
          return NextResponse.json({ success: false, error: 'Rate limit exceeded.' }, { status: 429 });
        rateData.count++;
      } else { rateLimitMap.set(ip_address, { count: 1, timestamp: now }); }
    } else { rateLimitMap.set(ip_address, { count: 1, timestamp: now }); }

    let payload_size, time_since_last_req, documentHash, userId;
    let originalFileName = 'document';
    let fileBuffer = null;
    let isPdf = false;

    if (req.headers.get('content-type')?.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      payload_size        = Number(formData.get('payload_size'))        || 5000;
      time_since_last_req = Number(formData.get('time_since_last_req')) || 1.0;
      userId = formData.get('userId') || 'system_user';
      if (!file) throw new Error('No file provided');
      originalFileName = file.name;
      isPdf = originalFileName.toLowerCase().endsWith('.pdf');
      fileBuffer = Buffer.from(await file.arrayBuffer());
      documentHash = '0x' + crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } else {
      const data = await req.json();
      payload_size        = data.payload_size        || 5000;
      time_since_last_req = data.time_since_last_req || 1.0;
      documentHash = data.document_hash || 'mock_hash_' + Date.now();
      userId = data.userId || 'system_user';
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const threatRes = await fetch(`${backendUrl}/api/predict-threat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip_address, payload_size, time_since_last_req }),
    });
    if (!threatRes.ok) throw new Error('Threat prediction service unavailable');
    const threatData  = await threatRes.json();
    const threatScore = threatData.threat_score;

    let signatureStatus  = 'Rejected (Threat > 0.8)';
    let blockchainTxHash = null;
    let digitalSignature = null;
    let publicKey        = null;

    if (threatScore <= 0.8) {
      const signFormData = new FormData();
      signFormData.append('document_hash', documentHash);
      const signRes = await fetch(`${backendUrl}/api/sign-document`, { method: 'POST', body: signFormData });
      if (!signRes.ok) throw new Error('Digital signature service unavailable');
      const signData   = await signRes.json();
      digitalSignature = signData.signature;
      publicKey        = signData.public_key;
      signatureStatus  = 'Signed (' + signData.algorithm + ')';

      try {
        const rpcUrl = process.env.SEPOLIA_RPC_URL;
        const ethPK  = process.env.PRIVATE_KEY;
        const contractAddr = process.env.CONTRACT_ADDRESS;
        if (rpcUrl && ethPK && contractAddr) {
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const wallet   = new ethers.Wallet(ethPK, provider);
          const contract = new ethers.Contract(contractAddr,
            ['function recordSignature(string memory _docHash, string memory _threatScore) external'], wallet);
          const tx = await contract.recordSignature(documentHash, threatScore.toString());
          blockchainTxHash = tx.hash;
        } else {
          console.warn('Blockchain env vars missing - using mock tx hash.');
          blockchainTxHash = 'mock_0x' + crypto.createHash('sha256').update(documentHash).digest('hex');
        }
      } catch (e) {
        console.error('Ethers.js error:', e);
        blockchainTxHash = 'error_0x' + crypto.createHash('sha256').update(documentHash).digest('hex');
      }
    }

    const log = await withRetry(() => prisma.signatureLog.create({
      data: { userId, documentHash, threatScore, signatureStatus, blockchainTxHash, digitalSignature, publicKey },
    }));

    const isMockTx = !blockchainTxHash || blockchainTxHash.startsWith('mock_') || blockchainTxHash.startsWith('error_');
    const signedAt  = new Date().toISOString();

    const verificationMetadata = {
      schema_version: '1.0',
      tool: 'QuantumGuard - ML-DSA-65 (CRYSTALS-Dilithium)',
      signed_at: signedAt,
      file_name: originalFileName,
      original_file_hash_sha256: documentHash,
      algorithm: 'ML-DSA-65',
      public_key: publicKey,
      digital_signature: digitalSignature,
      threat_score: threatScore,
      signature_status: signatureStatus,
      blockchain: {
        network: 'Sepolia Testnet',
        tx_hash: blockchainTxHash,
        explorer_url: isMockTx ? null : 'https://sepolia.etherscan.io/tx/' + blockchainTxHash,
      },
      log_id: log.id,
      verification_guide: {
        step1: 'For certified PDFs: upload the PDF directly to the Verify tab - proof is embedded inside.',
        step2: 'For other files: upload the original file + the .quantumguard.json proof to the Verify tab.',
        step3: "CLI verify: python -c \"import oqs,sys; s=oqs.Signature('ML-DSA-65'); print(s.verify(sys.argv[1].encode(), bytes.fromhex(sys.argv[2]), bytes.fromhex(sys.argv[3])))\" HASH SIG PUBKEY",
        step4: 'Blockchain: confirm tx_hash on https://sepolia.etherscan.io',
      },
    };

    let certifiedPdfBase64 = null;
    if (isPdf && fileBuffer && digitalSignature && publicKey) {
      try {
        const pdfDoc = await PDFDocument.load(fileBuffer);
        pdfDoc.setTitle('[QuantumGuard Certified] ' + originalFileName);
        pdfDoc.setCreator('QuantumGuard ML-DSA-65 Post-Quantum Security Platform');
        pdfDoc.setProducer('QuantumGuard v1.0 | liboqs ML-DSA-65 (CRYSTALS-Dilithium)');
        pdfDoc.setSubject('Post-Quantum Signed | ML-DSA-65 | SHA-256: ' + documentHash + ' | Signed: ' + signedAt);
        pdfDoc.setKeywords(['QuantumGuard', 'ML-DSA-65', 'CRYSTALS-Dilithium', 'SHA256:' + documentHash, 'TxHash:' + (blockchainTxHash || 'none')]);
        pdfDoc.setCreationDate(new Date());
        pdfDoc.setModificationDate(new Date());

        const proofBytes = Buffer.from(JSON.stringify(verificationMetadata, null, 2), 'utf-8');
        await pdfDoc.attach(proofBytes, 'quantumguard_proof.json', {
          mimeType: 'application/json',
          description: 'QuantumGuard Post-Quantum Signature Proof (ML-DSA-65)',
          creationDate: new Date(),
          modificationDate: new Date(),
        });

        const certifiedBytes = await pdfDoc.save();
        certifiedPdfBase64 = Buffer.from(certifiedBytes).toString('base64');
        console.log('Certified PDF generated:', certifiedBytes.length, 'bytes');
      } catch (pdfErr) {
        console.error('PDF embedding error:', pdfErr);
      }
    }

    return NextResponse.json({
      success: true,
      log_id: log.id,
      document_hash:         documentHash,
      digital_signature:     digitalSignature,
      public_key:            publicKey,
      blockchain_tx_hash:    blockchainTxHash,
      threat_score:          threatScore,
      signature_status:      signatureStatus,
      verification_metadata: verificationMetadata,
      certified_pdf_base64:  certifiedPdfBase64,
      is_pdf:                isPdf,
    });

  } catch (error: any) {
    console.error('Error processing signature:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
