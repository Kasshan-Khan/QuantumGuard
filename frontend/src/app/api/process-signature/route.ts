import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { ethers } from 'ethers';

// -- Rate Limiter ---------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

// -- DB retry wrapper (handles Neon cold-starts) --------------------------------
const withRetry = async <T,>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (i === retries - 1) throw e;
      if (e.code === 'P1001' || e.message?.includes("Can't reach database server")) {
        console.warn(`DB cold-start, retrying in ${delayMs}ms (attempt ${i + 1})`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw e;
      }
    }
  }
  throw new Error('Unreachable');
};

export async function POST(req: NextRequest) {
  try {
    const ip_address = req.headers.get('x-forwarded-for') || '127.0.0.1';

    // -- Rate Limiting ----------------------------------------------------------
    const now = Date.now();
    const rateData = rateLimitMap.get(ip_address);
    if (rateData) {
      if (now - rateData.timestamp < RATE_LIMIT_WINDOW_MS) {
        if (rateData.count >= MAX_REQUESTS_PER_WINDOW) {
          return NextResponse.json(
            { success: false, error: 'Rate limit exceeded. Please wait a minute.' },
            { status: 429 }
          );
        }
        rateData.count++;
      } else {
        rateLimitMap.set(ip_address, { count: 1, timestamp: now });
      }
    } else {
      rateLimitMap.set(ip_address, { count: 1, timestamp: now });
    }

    // -- Parse Request ----------------------------------------------------------
    let payload_size: number, time_since_last_req: number, documentHash: string, userId: string;
    let originalFileName = 'document';

    if (req.headers.get('content-type')?.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      payload_size        = Number(formData.get('payload_size'))        || 5000;
      time_since_last_req = Number(formData.get('time_since_last_req')) || 1.0;
      userId = (formData.get('userId') as string) || 'system_user';
      if (!file) throw new Error('No file provided in the request');
      originalFileName = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());
      documentHash = '0x' + crypto.createHash('sha256').update(buffer).digest('hex');
    } else {
      const data = await req.json();
      payload_size        = data.payload_size        || 5000;
      time_since_last_req = data.time_since_last_req || 1.0;
      documentHash = data.document_hash || 'mock_hash_' + Date.now();
      userId = data.userId || 'system_user';
    }

    // -- Step 1: QSVC Threat Prediction ----------------------------------------
    const threatRes = await fetch('http://localhost:8000/api/predict-threat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip_address, payload_size, time_since_last_req }),
    });
    if (!threatRes.ok) throw new Error('Threat prediction service unavailable');

    const threatData  = await threatRes.json();
    const threatScore: number = threatData.threat_score;

    // -- Step 2: ML-DSA-65 Signing (skipped if threat > 0.8) ------------------
    let signatureStatus  = 'Rejected (Threat > 0.8)';
    let blockchainTxHash: string | null = null;
    let digitalSignature: string | null = null;
    let publicKey:        string | null = null;

    if (threatScore <= 0.8) {
      const signFormData = new FormData();
      signFormData.append('document_hash', documentHash);

      const signRes = await fetch('http://localhost:8000/api/sign-document', {
        method: 'POST',
        body: signFormData,
      });
      if (!signRes.ok) throw new Error('Digital signature service unavailable');

      const signData   = await signRes.json();
      digitalSignature = signData.signature  as string; // hex ML-DSA-65 signature
      publicKey        = signData.public_key  as string; // server singleton public key (hex)
      signatureStatus  = `Signed (${signData.algorithm})`;

      // -- Step 3: Blockchain Anchoring (Sepolia) -------------------------------
      try {
        const rpcUrl          = process.env.SEPOLIA_RPC_URL;
        const ethPrivateKey   = process.env.PRIVATE_KEY;
        const contractAddress = process.env.CONTRACT_ADDRESS;

        if (rpcUrl && ethPrivateKey && contractAddress) {
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const wallet   = new ethers.Wallet(ethPrivateKey, provider);
          const abi      = ['function recordSignature(string memory _docHash, string memory _threatScore) external'];
          const contract = new ethers.Contract(contractAddress, abi, wallet);
          const tx       = await contract.recordSignature(documentHash, threatScore.toString());
          blockchainTxHash = tx.hash;
        } else {
          console.warn('Blockchain env vars missing - using deterministic mock tx hash.');
          blockchainTxHash = 'mock_0x' + crypto.createHash('sha256').update(documentHash).digest('hex');
        }
      } catch (e) {
        console.error('Ethers.js error:', e);
        blockchainTxHash = 'error_0x' + crypto.createHash('sha256').update(documentHash).digest('hex');
      }
    }

    // -- Step 4: Persist full proof to DB --------------------------------------
    const log = await withRetry(() =>
      prisma.signatureLog.create({
        data: {
          userId,
          documentHash,
          threatScore,
          signatureStatus,
          blockchainTxHash,
          digitalSignature,
          publicKey,
        },
      })
    );

    // -- Step 5: Build verifiable metadata sidecar -----------------------------
    // The frontend should offer this as a downloadable <filename>.quantumguard.json
    const isMockTx = !blockchainTxHash || blockchainTxHash.startsWith('mock_') || blockchainTxHash.startsWith('error_');
    const verificationMetadata = {
      schema_version: '1.0',
      tool: 'QuantumGuard - ML-DSA-65 (CRYSTALS-Dilithium)',
      signed_at: new Date().toISOString(),
      file_name: originalFileName,
      // Cryptographic proof
      document_hash_sha256: documentHash,
      algorithm: 'ML-DSA-65',
      public_key: publicKey,
      digital_signature: digitalSignature,
      // Threat analysis
      threat_score: threatScore,
      signature_status: signatureStatus,
      // Blockchain anchor
      blockchain: {
        network: 'Sepolia Testnet',
        tx_hash: blockchainTxHash,
        explorer_url: isMockTx ? null : `https://sepolia.etherscan.io/tx/${blockchainTxHash}`,
      },
      log_id: log.id,
      // Offline verification instructions
      verification_guide: {
        step1: 'SHA-256 hash the original file - must equal document_hash_sha256',
        step2: "python -c \"import oqs,sys; s=oqs.Signature('ML-DSA-65'); print(s.verify(bytes.fromhex(sys.argv[1][2:]),bytes.fromhex(sys.argv[2]),bytes.fromhex(sys.argv[3])))\" <doc_hash> <digital_signature> <public_key>",
        step3: 'Confirm blockchain.tx_hash on https://sepolia.etherscan.io shows the same document_hash',
      },
    };

    return NextResponse.json({
      success: true,
      log_id: log.id,
      // Full cryptographic proof
      document_hash:      documentHash,
      digital_signature:  digitalSignature,
      public_key:         publicKey,
      blockchain_tx_hash: blockchainTxHash,
      threat_score:       threatScore,
      signature_status:   signatureStatus,
      // Downloadable metadata sidecar
      verification_metadata: verificationMetadata,
    });

  } catch (error: any) {
    console.error('Error processing signature:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
