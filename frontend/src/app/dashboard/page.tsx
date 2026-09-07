"use client";

import { useEffect, useState } from "react";
import { Activity, ShieldAlert, Cpu, CheckSquare } from "lucide-react";

type LogEntry = {
  id: string;
  timestamp: string;
  userId: string;
  documentHash: string;
  threatScore: number;
  signatureStatus: string;
  blockchainTxHash: string | null;
};

export default function Dashboard() {
  const [mounted, setMounted] = useState(false);
  const [chartData, setChartData] = useState<{time: string, score: number}[]>(Array(20).fill({ time: "", score: 0 }));
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState({ total: 0, blocked: 0, secure: 0 });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    setMounted(true);
    
    const fetchLogs = async () => {
      try {
        const res = await fetch("/api/logs");
        const data = await res.json();
        
        if (data.success && data.logs) {
          setLogs(data.logs);
          setStats(data.stats);
          setLastUpdated(new Date());
          
          const recentLogs = [...data.logs].slice(0, 20).reverse();
          const newChartData = recentLogs.map((log: LogEntry) => ({
            time: new Date(log.timestamp).toLocaleTimeString([], { hour12: false }),
            score: log.threatScore
          }));
          
          while (newChartData.length < 20) {
            newChartData.unshift({ time: "", score: 0 });
          }
          
          setChartData(newChartData);
        }
      } catch(e) {
        console.error("Failed to fetch logs:", e);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto bg-black font-mono text-[#E0E0E0] selection:bg-[#00FF41] selection:text-black">
      <div className="max-w-[1600px] mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-[#333] pb-4">
          <div>
            <div className="text-xs text-[#888] mb-1">MODULE // 02</div>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-white">Telemetry & QSVM</h1>
            <p className="text-[#666] text-sm mt-2">Real-time threat detection metrics from the Quantum Support Vector Machine.</p>
          </div>
          <div className="text-right border border-[#333] bg-[#0a0a0a] p-3">
            <p className="text-[#666] text-xs">LAST_SYNC</p>
            <p className="text-white font-bold">{lastUpdated?.toLocaleTimeString() || "..."}</p>
            <div className="flex items-center gap-2 mt-1 justify-end">
              <span className="w-2 h-2 bg-[#00FF41] animate-pulse"></span>
              <span className="text-xs text-[#00FF41]">LIVE_FEED</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border border-[#333] bg-[#0a0a0a] p-6 relative">
            <div className="absolute top-0 right-0 bg-[#333] text-black text-xs px-2 py-1 font-bold">TOTAL_PROCESSED</div>
            <div className="flex items-center gap-4 mt-2">
              <Activity className="w-8 h-8 text-[#666]" />
              <div>
                <p className="text-5xl font-black text-white">{stats.total}</p>
              </div>
            </div>
          </div>
          
          <div className="border border-[#333] bg-[#0a0a0a] p-6 relative">
            <div className="absolute top-0 right-0 bg-[#00FF41] text-black text-xs px-2 py-1 font-bold">QSVM_CLEARED</div>
            <div className="flex items-center gap-4 mt-2">
              <CheckSquare className="w-8 h-8 text-[#00FF41]" />
              <div>
                <p className="text-5xl font-black text-[#00FF41]">{stats.secure}</p>
              </div>
            </div>
          </div>

          <div className="border border-[#333] bg-[#0a0a0a] p-6 relative">
            <div className="absolute top-0 right-0 bg-red-500 text-black text-xs px-2 py-1 font-bold">THREATS_BLOCKED</div>
            <div className="flex items-center gap-4 mt-2">
              <ShieldAlert className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-5xl font-black text-red-500">{stats.blocked}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Threat Monitor Chart (Simulated ASCII style) */}
        <div className="border border-[#333] bg-[#0a0a0a] relative">
          <div className="border-b border-[#333] p-3 flex justify-between bg-white text-black font-bold">
            <div className="flex items-center gap-2"><Cpu className="w-4 h-4" /> QSVM_THREAT_MONITOR</div>
            <div className="text-xs">THRESHOLD: 0.8</div>
          </div>
          <div className="p-6 h-[250px] flex items-end gap-1">
            {chartData.map((data, i) => {
              const isThreat = data.score > 0.8;
              const height = Math.max(5, (data.score / 1.0) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col justify-end group relative h-full">
                  <div className="w-full flex flex-col justify-end h-full">
                    <div 
                      className={`w-full transition-all duration-300 ${isThreat ? 'bg-red-500' : 'bg-[#00FF41]'} ${data.score === 0 ? 'opacity-20' : 'opacity-80 hover:opacity-100'}`} 
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  {data.score > 0 && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-white text-black text-xs px-2 py-1 pointer-events-none z-10 font-bold whitespace-nowrap">
                      {data.score.toFixed(3)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Raw Log Feed */}
        <div className="border border-[#333] bg-[#0a0a0a]">
          <div className="border-b border-[#333] p-3 bg-white text-black font-bold">
            RAW_LOG_FEED
          </div>
          <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
            {logs.slice(0, 10).map((log) => {
              const isThreat = log.threatScore > 0.8;
              return (
                <div key={log.id} className={`p-3 border-l-4 border-b border-t border-r border-[#222] bg-black ${isThreat ? 'border-l-red-500 text-red-400' : 'border-l-[#00FF41] text-[#E0E0E0]'}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex gap-4">
                      <span className="text-xs opacity-50">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="font-bold truncate max-w-xs">{log.documentHash.substring(0, 30)}...</span>
                    </div>
                    <div className="text-xs border px-2 py-1 bg-[#111] font-bold">
                      QSVM: {log.threatScore.toFixed(4)}
                    </div>
                  </div>
                  <div className="text-xs mt-2 opacity-70">
                    STATUS: {log.signatureStatus} | ID: {log.id}
                  </div>
                </div>
              );
            })}
            {logs.length === 0 && (
              <div className="text-center p-8 text-[#666] border border-dashed border-[#333]">
                AWAITING_DATA...
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
