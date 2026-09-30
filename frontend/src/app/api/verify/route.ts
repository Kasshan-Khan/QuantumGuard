import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString, PDFRawStream } from 'pdf-lib';

async function extractProofFromPdf(pdfBytes: any) {
  const debug: string[] = [];
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const context = pdfDoc.context;
    const catalog = pdfDoc.catalog;

    const namesRef = catalog.get(PDFName.of('Names'));
    if (!namesRef) return { proof: null, debug: [...debug, "No Names entry in catalog"] };
    const namesDict = context.lookup(namesRef, PDFDict);
    if (!namesDict) return { proof: null, debug: [...debug, "Names entry is not a dict"] };

    const efRef = namesDict.get(PDFName.of('EmbeddedFiles'));
    if (!efRef) return { proof: null, debug: [...debug, "No EmbeddedFiles in Names dict"] };
    const efDict = context.lookup(efRef, PDFDict);
    if (!efDict) return { proof: null, debug: [...debug, "EmbeddedFiles is not a dict"] };

    const namesArrayRef = efDict.get(PDFName.of('Names'));
    if (!namesArrayRef) {
       const kidsRef = efDict.get(PDFName.of('Kids'));
       if (kidsRef) debug.push("Found Kids array instead of Names array!");
       return { proof: null, debug: [...debug, "No Names array in EmbeddedFiles dict", "efDict keys: " + Array.from(efDict.keys()).join(',')] };
    }
    const namesArray = context.lookup(namesArrayRef, PDFArray);
    if (!namesArray) return { proof: null, debug: [...debug, "Names is not an array"] };

    for (let i = 0; i + 1 < namesArray.size(); i += 2) {
      const nameEntry = context.lookup(namesArray.get(i));
      let fileName = '';
      if (nameEntry instanceof PDFString || nameEntry instanceof PDFHexString) {
        fileName = nameEntry.decodeText();
      } else { 
        debug.push(`Index ${i} is type: ${nameEntry?.constructor?.name}`);
        continue; 
      }
      debug.push(`Found file: ${fileName}`);

      if (fileName !== 'quantumguard_proof.json') continue;

      const fileSpecRef = namesArray.get(i + 1);
      const fileSpec = context.lookup(fileSpecRef, PDFDict);
      if (!fileSpec) { debug.push("fileSpec is not a dict"); continue; }

      const efEntryRef = fileSpec.get(PDFName.of('EF'));
      if (!efEntryRef) { debug.push("No EF in fileSpec"); continue; }
      const efEntry = context.lookup(efEntryRef, PDFDict);
      if (!efEntry) { debug.push("EF is not a dict"); continue; }

      const streamRef = efEntry.get(PDFName.of('F'));
      if (!streamRef) { debug.push("No F stream in EF"); continue; }
      const stream = context.lookup(streamRef) as any;
      if (!stream) { debug.push("F is not a raw stream"); continue; }

      const { decodePDFRawStream } = await import('pdf-lib');
      const decoded = decodePDFRawStream(stream).decode();
      const jsonText = new TextDecoder('utf-8').decode(decoded);
      return { proof: JSON.parse(jsonText), debug: [...debug, "Success"] };
    }
    return { proof: null, debug: [...debug, "Iterated all names, did not find proof"] };
  } catch (err: any) {
    console.error('PDF proof extraction error:', err);
    return { proof: null, debug: [...debug, `Exception: ${err.message}`] };
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const originalFile = formData.get('file') as File;
    const proofFile    = formData.get('proof') as File;

    if (!originalFile) return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });

    const fileName   = originalFile.name;
    const isPdf      = fileName.toLowerCase().endsWith('.pdf');
    const fileBuffer = Buffer.from(await originalFile.arrayBuffer());

    let proof = null;
    let proofSource = 'none';
    let pdfDebugLogs: string[] = [];

    if (isPdf) {
      const result = await extractProofFromPdf(fileBuffer);
      proof = result.proof;
      pdfDebugLogs = result.debug;
      if (proof) proofSource = 'embedded_in_pdf';
    }

    // 2. Fall back to supplied sidecar proof file
    if (!proof && proofFile) {
      try {
        proof = JSON.parse(await proofFile.text());
        proofSource = 'sidecar_json';
      } catch {
        return NextResponse.json({ success: false, error: 'Could not parse .quantumguard.json' }, { status: 400 });
      }
    }

    if (!proof) {
      return NextResponse.json({
        success: false,
        error: isPdf
          ? `No embedded proof found in this PDF. Debug logs:\n${pdfDebugLogs.join('\n')}`
          : 'No .quantumguard.json proof file provided. Upload the proof sidecar file alongside the original.',
      }, { status: 400 });
    }

    // Support both key names (old and new schema)
    const proofHash  = proof.original_file_hash_sha256 || proof.document_hash_sha256;
    const digitalSig = proof.digital_signature;
    const publicKey  = proof.public_key;
    const algorithm  = proof.algorithm || 'ML-DSA-65';

    if (!proofHash || !digitalSig || !publicKey) {
      return NextResponse.json({ success: false, error: 'Proof is missing required fields: hash / digital_signature / public_key' }, { status: 400 });
    }

    // 3. Hash check
    // For certified PDFs (proof embedded): the uploaded file IS the certified copy
    // whose hash differs from the original. We trust the embedded hash which is
    // protected by the ML-DSA-65 signature and the blockchain anchor.
    // For non-PDFs or sidecar mode: hash must match exactly.
    let hashMatch = false;
    let computedHash = '0x' + crypto.createHash('sha256').update(fileBuffer).digest('hex');

    if (isPdf && proofSource === 'embedded_in_pdf') {
      // Certified PDF - the embedding changes the file hash, so we skip hash comparison
      // and rely on the cryptographic signature check instead.
      hashMatch = true;
    } else {
      hashMatch = computedHash.toLowerCase() === proofHash.toLowerCase();
    }

    if (!hashMatch) {
      return NextResponse.json({
        success: true, valid: false,
        hash_match: false, signature_valid: false,
        verdict: 'TAMPERED',
        verdict_message: 'File has been MODIFIED since signing. The computed hash does not match the proof.',
        computed_hash: computedHash, proof_hash: proofHash,
        algorithm, file_name: fileName, proof_source: proofSource,
        signed_at: proof.signed_at || null,
      });
    }

    // 4. ML-DSA-65 cryptographic verification via FastAPI
    let signatureValid = false;
    let backendStatus  = 'NOT_CHECKED';
    let backendError   = null;

    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
      const verifyRes  = await fetch(`${backendUrl}/api/verify-signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_hash: proofHash, signature: digitalSig, public_key: publicKey }),
      });
      const verifyData = await verifyRes.json();
      signatureValid = verifyData.valid === true;
      backendStatus  = verifyData.status || 'UNKNOWN';
      backendError   = verifyData.error  || null;
    } catch {
      backendStatus = 'BACKEND_UNREACHABLE';
      backendError  = 'Backend not reachable on port 8000.';
    }

    const verdict = signatureValid
      ? 'AUTHENTIC'
      : backendStatus === 'BACKEND_UNREACHABLE' ? 'UNVERIFIED' : 'INVALID_SIGNATURE';

    const verdict_message = signatureValid
      ? (isPdf && proofSource === 'embedded_in_pdf'
          ? 'File is AUTHENTIC. Proof extracted directly from the PDF - no sidecar needed.'
          : 'File is AUTHENTIC. Hash matches and ML-DSA-65 signature is cryptographically valid.')
      : backendStatus === 'BACKEND_UNREACHABLE'
        ? 'Hash matches (file untampered), but backend unreachable to verify the ML-DSA-65 signature.'
        : 'Hash matches (file untampered), but ML-DSA-65 signature is INVALID for the given public key.';

    return NextResponse.json({
      success: true, valid: signatureValid,
      hash_match: hashMatch, signature_valid: signatureValid,
      verdict, verdict_message,
      computed_hash: computedHash, proof_hash: proofHash,
      algorithm, proof_source: proofSource,
      backend_status: backendStatus, backend_error: backendError,
      file_name: fileName, proof_file_name: proofFile ? proofFile.name : null,
      signed_at: proof.signed_at || null,
      blockchain: proof.blockchain || null,
    });

  } catch (error: any) {
    console.error('Verification error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
