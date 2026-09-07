import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

const withRetry = async <T,>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (i === retries - 1) throw e;
      if (e.code === 'P1001' || (e.message && e.message.includes("Can't reach database server"))) {
        console.warn(`Database connection failed, retrying in ${delayMs}ms...`);
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw e;
      }
    }
  }
  throw new Error("Unreachable");
};

export async function GET() {
  try {
    const [logs, totalCount, blockedCount, secureCount] = await withRetry(() => Promise.all([
      prisma.signatureLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 100
      }),
      prisma.signatureLog.count(),
      prisma.signatureLog.count({ where: { threatScore: { gt: 0.8 } } }),
      prisma.signatureLog.count({ where: { threatScore: { lte: 0.8 } } })
    ]));
    
    return NextResponse.json({ 
      success: true, 
      logs,
      stats: {
        total: totalCount,
        blocked: blockedCount,
        secure: secureCount
      }
    });
  } catch (error: any) {
    console.error('Error fetching logs:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
