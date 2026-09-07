import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "QuantumGuard | Threat Detection",
  description: "Digital Signature Security PoC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <body className={cn(inter.className, "bg-black text-[#E0E0E0] flex flex-col min-h-screen relative antialiased selection:bg-[#00FF41] selection:text-black")}>
        <div className="fixed inset-0 z-[-1] pointer-events-none opacity-20 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <Navbar />
        <main className="flex-1 flex flex-col w-full pt-12">
          {children}
        </main>
      </body>
    </html>
  );
}
