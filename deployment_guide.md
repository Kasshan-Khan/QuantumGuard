# QuantumGuard Deployment Guide

This guide details how to deploy the QuantumGuard system into a production environment. The system consists of two distinct components:
1. **Frontend (Next.js)**: A serverless React application that handles UI, PDF manipulation, and Blockchain transactions.
2. **Backend (FastAPI)**: A Python application that runs the Quantum Support Vector Machine (QSVM) and the Post-Quantum cryptography (`liboqs`).

## 1. Deploying the Backend (FastAPI + liboqs)

The backend requires a full Linux environment with C++ build tools to compile `liboqs-python` and its C-bindings. Serverless edge functions (like Vercel) **will not work** for the backend.

### Recommended Providers
- Render (Web Service)
- Railway (App)
- AWS EC2 / DigitalOcean Droplet (Docker)

### Setup Steps (Render via Docker)
1. **Connect Repository**: Point Render to your repository and select **Docker** as the environment (not Python).
2. **Root Directory / Dockerfile**: Set the Root Directory to `backend/` so it detects `backend/Dockerfile`.
3. **Start Service**: Render will automatically build the Docker container (which installs `cmake` and `liboqs`) and start the `uvicorn` FastAPI server.
4. **Health Check**: Once deployed, verify it's working by hitting `https://<your-backend-url>/api/health` to see the health JSON.

---

## 2. Deploying the Frontend (Next.js)

The frontend can be easily deployed to Vercel, as it does not rely on heavy C-bindings directly.

### Recommended Provider
- Vercel (Native support for Next.js)

### Setup Steps
1. **Connect Repository**: Go to Vercel, import your repository, and set the Root Directory to `frontend/`.
2. **Environment Variables**: You must configure the following variables in the Vercel dashboard BEFORE building:
   - `DATABASE_URL`: Your Neon Postgres connection string (ensure it includes `?sslmode=require`).
   - `SEPOLIA_RPC_URL`: Your Alchemy/Infura RPC URL for the Sepolia testnet.
   - `PRIVATE_KEY`: Your Ethereum wallet private key (no `0x` prefix). Ensure this wallet has Sepolia ETH to pay for gas fees!
   - `CONTRACT_ADDRESS`: The deployed Solidity contract address (e.g. `0x242Cf5...`).
   - `BACKEND_URL`: The URL of the FastAPI backend you deployed in Step 1 (e.g. `https://quantumguard-backend.onrender.com`). Do not include trailing slashes.
3. **Deploy**: Click Deploy. Vercel will automatically run `npm run build` and provision the serverless API routes.

## 3. Post-Deployment Checks

1. **Test CORS & Connectivity**: Go to your deployed Vercel frontend. Upload a file on the Sign tab. If it gets stuck or fails immediately, press `F12` and check the Network tab. If you see CORS errors, you may need to add `CORSMiddleware` to the FastAPI backend allowing your Vercel domain.
2. **Test Blockchain**: Check that the `BLOCKCHAIN_TX` hash is generated and clickable, and successfully routes you to Sepolia Etherscan. If the backend fails to process a blockchain transaction, it defaults to a `mock_0x...` hash.
3. **Test PDF Certification**: Upload a PDF, download the certified copy, switch to the Verify tab, and upload the certified copy. Ensure the embedded proof extracts automatically and verifies successfully.

## Security Considerations
- **Private Keys**: NEVER commit your `.env` file containing the `PRIVATE_KEY` to GitHub. The included `.env.example` is safe, as it only contains dummy values.
- **Model Files**: Ensure `qsvm_model.joblib` and `scaler.joblib` are committed in the `backend/models` directory so the cloud provider can load them at startup.
- **Rate Limiting**: The Next.js frontend has basic in-memory rate limiting for API routes. In a true multi-server production environment, upgrade this to a Redis-backed rate limiter (e.g., Upstash) as in-memory maps reset per-lambda invocation.
