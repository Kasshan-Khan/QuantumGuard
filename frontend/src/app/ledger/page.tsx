"use client";

import { useState, useEffect } from "react";
import { Search } from "lucide-react";

type LogEntry = {
  id: string;
  timestamp: string;
  userId: string;
  documentHash: string;
  threatScore: number;
  signatureStatus: string;
  blockchainTxHash: string | null;
};

export default function Ledger() {
  const [mounted, setMounted] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    setMounted(true);
    
    const fetchLogs = async () => {
      try {
        const res = await fetch("/api/logs");
        const data = await res.json();
        
        if (data.success && data.logs) {
          const signedDocs = data.logs.filter((log: LogEntry) => log.blockchainTxHash !== null);
          setEntries(signedDocs);
        }
      } catch(e) {
        console.error("Failed to fetch ledger entries:", e);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto min-h-screen bg-black font-mono text-[#E0E0E0] selection:bg-[#00FF41] selection:text-black">
      <div className="max-w-[1600px] mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-[#333] pb-4">
          <div>
            <div className="text-xs text-[#888] mb-1">MODULE // 03</div>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-white">Cryptographic Ledger</h1>
            <p className="text-[#666] text-sm mt-2">Immutable ML-DSA-65 signatures anchored to the Sepolia network.</p>
          </div>
          <div className="flex border border-[#333] bg-[#0a0a0a]">
            <div className="p-3 border-r border-[#333] flex items-center justify-center">
              <Search className="w-4 h-4 text-[#666]" />
            </div>
            <input 
              type="text" 
              placeholder="SEARCH_HASH..." 
              className="bg-transparent border-none outline-none text-sm px-4 py-2 w-64 text-white placeholder-[#555]"
            />
          </div>
        </div>

        <div className="border border-[#333] bg-[#0a0a0a] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white text-black text-xs font-bold uppercase tracking-wider border-b-2 border-[#333]">
                  <th className="p-4 whitespace-nowrap">TIMESTAMP</th>
                  <th className="p-4">DOCUMENT_HASH</th>
                  <th className="p-4">QSVM_SCORE</th>
                  <th className="p-4">SIGNATURE_STATUS</th>
                  <th className="p-4 text-right">SEPOLIA_TX</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {entries.length > 0 ? (
                  entries.map((entry) => (
                    <tr 
                      key={entry.id} 
                      className="border-b border-[#222] hover:bg-[#111] transition-colors"
                    >
                      <td className="p-4 whitespace-nowrap text-[#888]">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="p-4 font-bold text-white max-w-[200px] truncate" title={entry.documentHash}>
                        {entry.documentHash}
                      </td>
                      <td className="p-4">
                        <span className="bg-[#00FF41]/10 text-[#00FF41] border border-[#00FF41]/30 px-2 py-1 text-xs">
                          {entry.threatScore.toFixed(4)}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-[#ccc]">
                        {entry.signatureStatus}
                      </td>
                      <td className="p-4 text-right">
                        <a 
                          href={entry.blockchainTxHash?.startsWith('0x') ? `https://sepolia.etherscan.io/tx/${entry.blockchainTxHash}` : '#'} 
                          target={entry.blockchainTxHash?.startsWith('0x') ? "_blank" : "_self"}
                          rel="noreferrer"
                          className="inline-block border border-[#333] hover:border-[#00FF41] hover:text-[#00FF41] text-[#888] bg-black px-3 py-1 text-xs transition-colors"
                        >
                          VERIFY_TX_&gt;
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-[#666] border border-dashed border-[#333] m-4">
                      [ DATABASE_EMPTY // NO_VERIFIED_ENTRIES_FOUND ]
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
