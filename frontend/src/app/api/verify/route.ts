import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const originalFile = formData.get("file") as File | null;
    const proofFile    = formData.get("proof") as File | null;

    if (!originalFile) return NextResponse.json({ success: false, error: "No original file. Send as form field: file" }, { status: 400 });
    if (!proofFile)    return NextResponse.json({ success: false, error: "No proof file. Send .quantumguard.json as form field: proof" }, { status: 400 });

    // 1. Parse proof JSON
    let proof: any;
    try { proof = JSON.parse(await proofFile.text()); }
    catch { return NextResponse.json({ success: false, error: "Invalid .quantumguard.json" }, { status: 400 }); }

    const { document_hash_sha256, digital_signature, public_key, algorithm } = proof;
    if (!document_hash_sha256 || !digital_signature || !public_key) {
      return NextResponse.json({ success: false, error: "Proof missing: document_hash_sha256 / digital_signature / public_key" }, { status: 400 });
    }

    // 2. Recompute SHA-256 of the original file
    const fileBuffer   = Buffer.from(await originalFile.arrayBuffer());
    const computedHash = "0x" + crypto.createHash("sha256").update(fileBuffer).digest("hex");
    const hashMatch    = computedHash.toLowerCase() === document_hash_sha256.toLowerCase();

    if (!hashMatch) {
      return NextResponse.json({
        success: true, valid: false,
        hash_match: false, signature_valid: false,
        verdict: "TAMPERED",
        verdict_message: "File has been MODIFIED since signing. Hash mismatch.",
        computed_hash: computedHash,
        proof_hash: document_hash_sha256,
        algorithm: algorithm ?? "ML-DSA-65",
        file_name: originalFile.name,
        signed_at: proof.signed_at ?? null,
      });
    }

    // 3. Call FastAPI for real ML-DSA-65 verification
    let signatureValid = false;
    let backendStatus  = "NOT_CHECKED";
    let backendError: string | null = null;
    try {
      const verifyRes  = await fetch("http://localhost:8000/api/verify-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_hash: document_hash_sha256, signature: digital_signature, public_key }),
      });
      const verifyData = await verifyRes.json();
      signatureValid = verifyData.valid === true;
      backendStatus  = verifyData.status ?? "UNKNOWN";
      backendError   = verifyData.error ?? null;
    } catch (e: any) {
      backendStatus = "BACKEND_UNREACHABLE";
      backendError  = "Backend not reachable on port 8000.";
    }

    // 4. Build verdict
    const verdict = signatureValid
      ? "AUTHENTIC"
      : backendStatus === "BACKEND_UNREACHABLE" ? "UNVERIFIED" : "INVALID_SIGNATURE";

    const verdict_message = signatureValid
      ? "File is AUTHENTIC. Hash matches and ML-DSA-65 signature is cryptographically valid."
      : backendStatus === "BACKEND_UNREACHABLE"
        ? "Hash matches (file untampered), but backend unreachable to verify the ML-DSA-65 signature."
        : "Hash matches (file untampered), but ML-DSA-65 signature is INVALID for the given public key.";

    return NextResponse.json({
      success: true, valid: signatureValid,
      hash_match: true, signature_valid: signatureValid,
      verdict, verdict_message,
      computed_hash: computedHash, proof_hash: document_hash_sha256,
      algorithm: algorithm ?? "ML-DSA-65",
      backend_status: backendStatus, backend_error: backendError,
      file_name: originalFile.name, proof_file_name: proofFile.name,
      signed_at: proof.signed_at ?? null,
      blockchain: proof.blockchain ?? null,
    });

  } catch (error: any) {
    console.error("Verification error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
