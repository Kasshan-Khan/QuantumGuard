import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { ethers } from 'ethers';

// Simple in-memory rate limiter for PoC
const rateLimitMap = new Map<string, { count: number, timestamp: number }>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5; // 5 requests per minute max

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

export async function POST(req: NextRequest) {
  try {
    const ip_address = req.headers.get('x-forwarded-for') || '127.0.0.1';
    
    // Rate Limiting Logic
    const now = Date.now();
    const rateData = rateLimitMap.get(ip_address);
    if (rateData) {
      if (now - rateData.timestamp < RATE_LIMIT_WINDOW_MS) {
        if (rateData.count >= MAX_REQUESTS_PER_WINDOW) {
          return NextResponse.json({ success: false, error: 'Rate limit exceeded. Please wait a minute.' }, { status: 429 });
        }
        rateData.count++;
      } else {
        rateLimitMap.set(ip_address, { count: 1, timestamp: now });
      }
    } else {
      rateLimitMap.set(ip_address, { count: 1, timestamp: now });
    }

    let payload_size, time_since_last_req, realDocumentHash, userId;

    // Parse real file uploads as FormData, fallback to JSON for attack_simulator.py
    if (req.headers.get('content-type')?.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      payload_size = Number(formData.get('payload_size')) || 5000;
      time_since_last_req = Number(formData.get('time_since_last_req')) || 1.0;
      userId = formData.get('userId') as string || 'system_user';

      if (!file) throw new Error('No file provided in the request');

      const buffer = Buffer.from(await file.arrayBuffer());
      realDocumentHash = '0x' + crypto.createHash('sha256').update(buffer).digest('hex');
    } else {
      const data = await req.json();
      payload_size = data.payload_size || 5000; 
      time_since_last_req = data.time_since_last_req || 1.0;
      realDocumentHash = data.document_hash || 'mock_hash_' + Date.now();
      userId = data.userId || 'system_user';
    }

    // 1. Send data to Python FastAPI for Threat Prediction
    const threatRes = await fetch('http://localhost:8000/api/predict-threat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip_address, payload_size, time_since_last_req })
    });
    
    if (!threatRes.ok) {
      throw new Error('Failed to communicate with threat prediction service');
    }
    
    const threatData = await threatRes.json();
    const threatScore = threatData.threat_score;

    let signatureStatus = "Rejected (Threat > 0.8)";
    let blockchainTxHash = null;

    // 2. If threat score is acceptable, proceed to digital signature
    if (threatScore <= 0.8) {
      const signFormData = new FormData();
      signFormData.append('document_hash', realDocumentHash);

      const signRes = await fetch('http://localhost:8000/api/sign-document', {
        method: 'POST',
        body: signFormData
      });

      if (!signRes.ok) {
        throw new Error('Failed to communicate with digital signature service');
      }

      const signData = await signRes.json();
      signatureStatus = `Signed (${signData.algorithm})`;
      blockchainTxHash = signData.signature; // Fallback mock
      
      // Real Blockchain Anchoring via Ethers.js
      try {
        const rpcUrl = process.env.SEPOLIA_RPC_URL;
        const privateKey = process.env.PRIVATE_KEY;
        const contractAddress = process.env.CONTRACT_ADDRESS;
        
        if (rpcUrl && privateKey && contractAddress) {
          const provider = new ethers.JsonRpcProvider(rpcUrl);
          const wallet = new ethers.Wallet(privateKey, provider);
          const abi = ["function recordSignature(string memory _docHash, string memory _threatScore) external"];
          const contract = new ethers.Contract(contractAddress, abi, wallet);
          
          const tx = await contract.recordSignature(realDocumentHash, threatScore.toString());
          blockchainTxHash = tx.hash; // Real on-chain transaction hash
        } else {
          console.warn("Blockchain environment variables missing. Falling back to mock tx hash.");
        }
      } catch (e) {
        console.error("Ethers.js Smart Contract error:", e);
      }
    }

    // 3. Save log to database using Prisma with retries for Neon cold starts
    const log = await withRetry(() => prisma.signatureLog.create({
      data: {
        userId,
        documentHash: realDocumentHash,
        threatScore,
        signatureStatus,
        blockchainTxHash
      }
    }));

    return NextResponse.json({ success: true, log, threatScore, signatureStatus });

  } catch (error: any) {
    console.error('Error processing signature:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
