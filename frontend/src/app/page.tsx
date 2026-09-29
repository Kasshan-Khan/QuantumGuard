"use client";

import { useState, useRef } from "react";

const STEPS = [
  { id: "uploading", label: "01 // SECURE_INGEST", desc: "Transport layer encrypted." },
  { id: "qsvm", label: "02 // QSVM_ANALYSIS", desc: "Quantum anomaly check." },
  { id: "mldsa", label: "03 // ML_DSA_SIGNATURE", desc: "Dilithium-3 keygen active." },
  { id: "success", label: "04 // LEDGER_ANCHOR", desc: "Sepolia Tx committed." },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"sign" | "verify">("sign");

  // ── Sign tab state ──
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "qsvm" | "mldsa" | "success" | "rejected">("idle");
  const [threatScore, setThreatScore] = useState<number | null>(null);
  const [signatureHash, setSignatureHash] = useState<string | null>(null);
  const [documentHash, setDocumentHash] = useState<string | null>(null);
  const [digitalSignature, setDigitalSignature] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [verificationMetadata, setVerificationMetadata] = useState<object | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Verify tab state ──
  const [verifyOrigFile, setVerifyOrigFile] = useState<File | null>(null);
  const [verifyProofFile, setVerifyProofFile] = useState<File | null>(null);
  const [verifyResult, setVerifyResult] = useState<any | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const verifyOrigRef  = useRef<HTMLInputElement>(null);
  const verifyProofRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFileSelection(e.dataTransfer.files[0]);
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFileSelection(e.target.files[0]);
  };

  const handleFileSelection = async (selectedFile: File) => {
    setFile(selectedFile);
    setStatus("uploading");
    setThreatScore(null);
    setSignatureHash(null);
    setDocumentHash(null);
    setDigitalSignature(null);
    setPublicKey(null);
    setVerificationMetadata(null);
    
    await new Promise(resolve => setTimeout(resolve, 600));
    setStatus("qsvm");
    
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("payload_size", selectedFile.size.toString());
      formData.append("time_since_last_req", "1.5");

      const res = await fetch("/api/process-signature", {
        method: "POST",
        body: formData
      });
      
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed');

      // API returns snake_case fields
      const score: number = data.threat_score;
      setThreatScore(score);
      setDocumentHash(data.document_hash ?? null);
      setDigitalSignature(data.digital_signature ?? null);
      setPublicKey(data.public_key ?? null);
      setVerificationMetadata(data.verification_metadata ?? null);

      if (score > 0.8) {
        setStatus("rejected");
      } else {
        await new Promise(resolve => setTimeout(resolve, 400));
        setStatus("mldsa");
        await new Promise(resolve => setTimeout(resolve, 800));
        setSignatureHash(data.blockchain_tx_hash ?? null);
        setStatus("success");
      }
    } catch (error) {
      console.error(error);
      setStatus("rejected");
    }
  };

  // ── Verify handler ──
  const handleVerify = async () => {
    if (!verifyOrigFile || !verifyProofFile) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const fd = new FormData();
      fd.append("file",  verifyOrigFile);
      fd.append("proof", verifyProofFile);
      const res  = await fetch("/api/verify", { method: "POST", body: fd });
      const data = await res.json();
      setVerifyResult(data);
    } catch (e: any) {
      setVerifyResult({ success: false, error: e.message });
    } finally {
      setVerifyLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-black text-[#E0E0E0] font-mono flex flex-col p-4 md:p-8 relative">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 h-full max-w-[1600px] mx-auto w-full">

        {/* Left panel */}
        <div className="flex flex-col space-y-8">
          {/* Header */}
          <div className="border border-[#333] bg-[#0a0a0a] p-6 relative">
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white"></div>
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white"></div>
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white"></div>
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white"></div>
            <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tighter text-white mb-2">
              Aegis_Command<span className="text-[#00FF41] animate-pulse">_</span>
            </h1>
            <p className="text-sm text-[#888] max-w-xl">
              [WARNING] POST-QUANTUM SECURE ENCLAVE. UNAUTHORIZED ACCESS IS LOGGED AND TERMINATED VIA ML-DSA-65.
            </p>
          </div>

          {/* Tab Toggle */}
          <div className="flex border border-[#333]">
            <button
              onClick={() => setActiveTab("sign")}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${
                activeTab === "sign"
                  ? "bg-[#00FF41] text-black"
                  : "bg-black text-[#666] hover:text-white"
              }`}
            >
              [ SIGN_DOCUMENT ]
            </button>
            <button
              onClick={() => setActiveTab("verify")}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${
                activeTab === "verify"
                  ? "bg-[#00FF41] text-black"
                  : "bg-black text-[#666] hover:text-white"
              }`}
            >
              [ VERIFY_SIGNATURE ]
            </button>
          </div>

          {/* SIGN TAB */}
          {activeTab === "sign" && (
            <div
              className={`flex-1 border-2 border-dashed ${status === 'idle' ? 'border-[#444] hover:border-[#00FF41] cursor-pointer' : 'border-[#222]'} bg-[#050505] relative flex flex-col items-center justify-center p-8 min-h-[400px] transition-colors`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => status === "idle" && fileInputRef.current?.click()}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" disabled={status !== "idle"} />
              {!file ? (
                <div className="text-center space-y-4">
                  <div className="text-[#00FF41] font-bold text-xl">[ DROP ZONE ]</div>
                  <div className="text-[#666] text-sm">TARGET_DATA {`=>`} /dev/null OR CLICK TO BROWSE</div>
                </div>
              ) : (
                <div className="w-full max-w-md border border-[#333] bg-black p-4">
                  <div className="text-xs text-[#888] mb-4 pb-2 border-b border-[#333]">FILE_METADATA_EXTRACTED</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-[#666]">FILE_NAME</span><span className="text-white truncate ml-4">{file.name}</span></div>
                    <div className="flex justify-between"><span className="text-[#666]">BYTE_SIZE</span><span className="text-white">{file.size} B</span></div>
                    <div className="flex justify-between"><span className="text-[#666]">STATUS</span><span className={status === 'rejected' ? 'text-red-500 font-bold' : status === 'success' ? 'text-[#00FF41] font-bold' : 'text-yellow-500'}>{status.toUpperCase()}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VERIFY TAB */}
          {activeTab === "verify" && (
            <div className="flex-1 bg-[#050505] border border-[#333] p-8 space-y-6">
              <div className="text-xs text-[#666] border-b border-[#333] pb-3">VERIFICATION_MODE // Upload original file + .quantumguard.json proof</div>

              {/* Upload original file */}
              <div>
                <div className="text-xs text-[#888] mb-2">STEP_1 // SELECT_ORIGINAL_FILE</div>
                <button
                  onClick={() => verifyOrigRef.current?.click()}
                  className="w-full border border-dashed border-[#444] hover:border-[#00FF41] text-[#666] hover:text-[#00FF41] py-4 text-sm transition-colors"
                >
                  {verifyOrigFile ? `[ ${verifyOrigFile.name} ]` : "[ CLICK TO SELECT ORIGINAL FILE ]"}
                </button>
                <input type="file" ref={verifyOrigRef} className="hidden" onChange={e => e.target.files && setVerifyOrigFile(e.target.files[0])} />
              </div>

              {/* Upload proof file */}
              <div>
                <div className="text-xs text-[#888] mb-2">STEP_2 // SELECT_PROOF_FILE (.quantumguard.json)</div>
                <button
                  onClick={() => verifyProofRef.current?.click()}
                  className="w-full border border-dashed border-[#444] hover:border-yellow-500 text-[#666] hover:text-yellow-500 py-4 text-sm transition-colors"
                >
                  {verifyProofFile ? `[ ${verifyProofFile.name} ]` : "[ CLICK TO SELECT .quantumguard.json ]"}
                </button>
                <input type="file" ref={verifyProofRef} className="hidden" accept=".json" onChange={e => e.target.files && setVerifyProofFile(e.target.files[0])} />
              </div>

              {/* Run verification */}
              <button
                onClick={handleVerify}
                disabled={!verifyOrigFile || !verifyProofFile || verifyLoading}
                className="w-full border border-[#00FF41] text-[#00FF41] py-3 font-bold text-sm hover:bg-[#00FF41] hover:text-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {verifyLoading ? "[ VERIFYING... ]" : "[ RUN_VERIFICATION ]"}
              </button>

              {/* Verification result */}
              {verifyResult && (
                <div className={`border p-4 space-y-3 ${
                  verifyResult.verdict === "AUTHENTIC" ? "border-[#00FF41] bg-[#00FF41]/5" :
                  verifyResult.verdict === "TAMPERED"  ? "border-red-500 bg-red-500/5" :
                  "border-yellow-500 bg-yellow-500/5"
                }`}>
                  <div className={`text-lg font-bold ${
                    verifyResult.verdict === "AUTHENTIC" ? "text-[#00FF41]" :
                    verifyResult.verdict === "TAMPERED"  ? "text-red-500" :
                    "text-yellow-500"
                  }`}>
                    {verifyResult.verdict === "AUTHENTIC"         ? "✓ AUTHENTIC" :
                     verifyResult.verdict === "TAMPERED"          ? "✗ TAMPERED" :
                     verifyResult.verdict === "INVALID_SIGNATURE" ? "✗ INVALID SIGNATURE" :
                     "⚠ UNVERIFIED"}
                  </div>
                  <div className="text-xs text-[#aaa]">{verifyResult.verdict_message}</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#666]">HASH_MATCH</span>
                      <span className={verifyResult.hash_match ? "text-[#00FF41]" : "text-red-500"}>
                        {verifyResult.hash_match ? "PASS" : "FAIL"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#666]">ML_DSA_VERIFY</span>
                      <span className={verifyResult.signature_valid ? "text-[#00FF41]" : "text-red-500"}>
                        {verifyResult.signature_valid ? "PASS" : verifyResult.backend_status}
                      </span>
                    </div>
                    {verifyResult.signed_at && (
                      <div className="flex justify-between">
                        <span className="text-[#666]">SIGNED_AT</span>
                        <span className="text-white">{new Date(verifyResult.signed_at).toLocaleString()}</span>
                      </div>
                    )}
                    {verifyResult.blockchain?.tx_hash && (
                      <div className="pt-1">
                        <div className="text-[#666] mb-1">BLOCKCHAIN_TX</div>
                        <div className="text-[#00FF41] font-mono break-all text-xs bg-black p-2 border border-[#333]">
                          {verifyResult.blockchain.tx_hash}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Telemetry Sidebar */}
        <div className="border border-[#333] bg-[#050505] flex flex-col h-full">
          <div className="border-b border-[#333] p-4 bg-white text-black font-bold flex justify-between">
            <span>PIPELINE_TELEMETRY</span>
            <span>{status === 'idle' ? 'STANDBY' : 'ACTIVE'}</span>
          </div>

          <div className="p-6 flex-1 space-y-6">
            {STEPS.map((step, idx) => {
              const statusOrder = ["idle", "uploading", "qsvm", "mldsa", "success"];
              const currentIndex = statusOrder.indexOf(status === "rejected" ? "qsvm" : status);
              
              let state = "pending";
              if (status === "rejected" && step.id === "qsvm") state = "failed";
              else if (idx < currentIndex - 1 || (status === "success" && idx <= 3)) state = "done";
              else if (idx === currentIndex - 1) state = "active";

              // Check if state evaluates to active using a different variable to avoid outer scope shadowing.
              const isActive = (idx === currentIndex - 1 && status !== 'rejected') || (status === 'success' && idx===3);
              const isDone = idx < currentIndex - 1 || (status === 'success' && idx<=3);
              const isFailed = status === 'rejected' && step.id === 'qsvm';

              return (
                <div key={step.id} className={`flex items-start gap-4 ${isActive || isDone || isFailed ? 'opacity-100' : 'opacity-30'}`}>
                  <div className={`w-3 h-3 mt-1 ${isDone ? 'bg-[#00FF41]' : isActive ? 'bg-yellow-500 animate-pulse' : isFailed ? 'bg-red-500' : 'border border-[#555]'}`} />
                  <div>
                    <div className={`text-sm font-bold ${isFailed ? 'text-red-500' : 'text-white'}`}>{step.label}</div>
                    <div className="text-xs text-[#666] mt-1">{step.desc}</div>
                    
                    {step.id === 'qsvm' && isDone && threatScore !== null && (
                      <div className="mt-2 text-xs text-[#00FF41] border border-[#00FF41]/30 bg-[#00FF41]/10 px-2 py-1 inline-block">
                        QSVM_SCORE: {threatScore.toFixed(4)} [SAFE]
                      </div>
                    )}
                    {step.id === 'qsvm' && isFailed && threatScore !== null && (
                      <div className="mt-2 text-xs text-red-500 border border-red-500/30 bg-red-500/10 px-2 py-1 inline-block">
                        QSVM_SCORE: {threatScore.toFixed(4)} [THREAT_DETECTED]
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cryptographic Proof Panel */}
          {status === 'success' && (
            <div className="border-t border-[#333] p-4 bg-[#0a0a0a] space-y-3">
              {documentHash && (
                <div>
                  <div className="text-xs text-[#666] mb-1">DOC_HASH_SHA256</div>
                  <div className="text-xs font-mono text-[#00FF41] break-all bg-black p-2 border border-[#333]">
                    {documentHash}
                  </div>
                </div>
              )}
              {signatureHash && (
                <div>
                  <div className="text-xs text-[#666] mb-1">BLOCKCHAIN_TX_HASH</div>
                  <div className="text-xs font-mono text-[#00FF41] break-all bg-black p-2 border border-[#333]">
                    {signatureHash.length > 80 ? signatureHash.substring(0, 80) + '...' : signatureHash}
                  </div>
                </div>
              )}
              {publicKey && (
                <div>
                  <div className="text-xs text-[#666] mb-1">ML_DSA_PUBLIC_KEY (truncated)</div>
                  <div className="text-xs font-mono text-[#00FF41] break-all bg-black p-2 border border-[#333]">
                    {publicKey.substring(0, 64)}...
                  </div>
                </div>
              )}
              {digitalSignature && (
                <div>
                  <div className="text-xs text-[#666] mb-1">ML_DSA_SIGNATURE (truncated)</div>
                  <div className="text-xs font-mono text-yellow-500 break-all bg-black p-2 border border-[#333]">
                    {digitalSignature.substring(0, 64)}...
                  </div>
                </div>
              )}
              {verificationMetadata && (
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(verificationMetadata, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${file?.name ?? 'document'}.quantumguard.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full mt-2 border border-[#00FF41] text-[#00FF41] text-xs py-2 px-3 hover:bg-[#00FF41] hover:text-black transition-colors font-bold"
                >
                  [ DOWNLOAD_PROOF.json ]
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
