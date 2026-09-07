"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { name: '[01] INGEST', href: '/' },
    { name: '[02] TELEMETRY', href: '/dashboard' },
    { name: '[03] LEDGER', href: '/ledger' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-12 bg-black border-b border-[#333] font-mono text-xs uppercase tracking-widest">
      <div className="flex items-center gap-4">
        <div className="bg-white text-black px-2 py-1 font-bold">
          QG-SYS // 26
        </div>
        <div className="hidden sm:block text-[#666]">
          POST-QUANTUM SECURE ENCLAVE
        </div>
      </div>

      <div className="flex items-center">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          
          return (
            <Link 
              key={item.href} 
              href={item.href} 
              className={`px-4 h-12 flex items-center border-l border-[#333] transition-none ${
                isActive 
                  ? "bg-white text-black font-bold" 
                  : "text-[#888] hover:bg-[#111] hover:text-white"
              }`}
            >
              {item.name}
            </Link>
          );
        })}
        <div className="px-4 h-12 flex items-center border-l border-[#333] text-[#00FF41]">
          SYS: ON
        </div>
      </div>
    </nav>
  );
}
