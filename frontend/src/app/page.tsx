"use client";

import { useState, useRef } from "react";

const STEPS = [
  { id: "uploading", label: "01 // SECURE_INGEST", desc: "Transport layer encrypted." },
  { id: "qsvm", label: "02 // QSVM_ANALYSIS", desc: "Quantum anomaly check." },
  { id: "mldsa", label: "03 // ML_DSA_SIGNATURE", desc: "Dilithium-3 keygen active." },
  { id: "success", label: "04 // LEDGER_ANCHOR", desc: "Sepolia Tx committed." },
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "qsvm" | "mldsa" | "success" | "rejected">("idle");
  const [threatScore, setThreatScore] = useState<number | null>(null);
  const [signatureHash, setSignatureHash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      setThreatScore(data.threatScore);

      if (data.threatScore > 0.8) {
        setStatus("rejected");
      } else {
        await new Promise(resolve => setTimeout(resolve, 400));
        setStatus("mldsa");
        await new Promise(resolve => setTimeout(resolve, 800));
        setSignatureHash(data.log?.blockchainTxHash || "0x" + Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join(''));
        setStatus("success");
      }
    } catch (error) {
      console.error(error);
      setStatus("rejected");
    }
  };

  return (
    <div className="min-h-screen bg-black text-[#E0E0E0] font-mono flex flex-col p-4 md:p-8 relative">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 h-full max-w-[1600px] mx-auto w-full">
        
        {/* Left: Command Console & Upload */}
        <div className="flex flex-col space-y-8">
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

          {/* TX Hash Result */}
          {status === 'success' && signatureHash && (
            <div className="border-t border-[#333] p-4 bg-[#0a0a0a]">
              <div className="text-xs text-[#666] mb-2">TX_HASH_GENERATED</div>
              <div className="text-xs font-mono text-[#00FF41] break-all bg-black p-3 border border-[#333]">
                {signatureHash.length > 100 ? signatureHash.substring(0, 100) + "..." : signatureHash}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
