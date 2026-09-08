# Quantum-Inspired Cyber Threat Detection & Quantum-Safe Document Signing System

This project is a comprehensive system designed to provide cutting-edge security through quantum-inspired threat detection and quantum-safe document signing. Built for the post-quantum era, it leverages Quantum Support Vector Machines (QSVM) to predict cyber threats and NIST-standardized quantum-resistant cryptographic algorithms to securely sign and verify documents on the blockchain.

## 🚀 Key Features

*   **Quantum-Inspired Threat Detection:** Utilizes QSVM (Quantum Support Vector Machine) via Qiskit to predict potential cyber threats with high accuracy based on network or system logs.
*   **Quantum-Safe Document Signing:** Implements `liboqs` (ML-DSA-65 / CRYSTALS-Dilithium) to provide post-quantum cryptographic hashing and signing for documents, ensuring they remain secure against future quantum computer attacks.
*   **Immutable Blockchain Logging:** Logs signature events on the blockchain using Solidity smart contracts (`SignatureRegistry.sol`), providing an immutable, tamper-proof audit trail.
*   **Attack Simulation:** Includes a built-in `attack_simulator.py` to generate test data and simulate cyber-attacks, allowing for rigorous testing of the threat detection module.
*   **Modern Web Interface:** A highly responsive frontend built with Next.js 16.3, React 19, and Tailwind CSS, featuring interactive charts (Recharts) for threat analytics.

## 🛠️ Tech Stack

### Frontend
*   **Framework:** Next.js 16.3 (React 19)
*   **Styling:** Tailwind CSS
*   **Database ORM:** Prisma
*   **Web3 Integration:** Ethers.js
*   **Data Visualization:** Recharts

### Backend
*   **Framework:** FastAPI (Python)
*   **Quantum ML:** Qiskit, joblib (for QSVM model)
*   **Post-Quantum Cryptography:** `liboqs` (ML-DSA-65 / CRYSTALS-Dilithium)
*   **Endpoints:** `/api/predict-threat`, `/api/sign-document`

### Blockchain
*   **Development Environment:** Hardhat
*   **Smart Contracts:** Solidity (`SignatureRegistry.sol`)

## ⚙️ Setup and Installation

### Prerequisites
*   Node.js (v18 or higher)
*   Python 3.10+
*   MetaMask or any compatible Web3 wallet (for interacting with the blockchain)

### 1. Blockchain Setup (Hardhat)

1.  Navigate to the blockchain directory (if applicable, or root if it's a monorepo structure).
2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```
3.  Compile the smart contracts:
    ```bash
    npx hardhat compile
    ```
4.  Start a local Hardhat node:
    ```bash
    npx hardhat node
    ```
5.  Deploy the `SignatureRegistry.sol` contract to your local network (in a new terminal):
    ```bash
    npx hardhat run scripts/deploy.js --network localhost
    ```
    *Note: Save the deployed contract address as you will need it for the frontend environment variables.*

### 2. Backend Setup (FastAPI)

1.  Navigate to the backend directory.
2.  Create and activate a virtual environment:
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```
3.  Install Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```
    *Ensure `liboqs-python` and `qiskit` are correctly installed.*
4.  Run the FastAPI server:
    ```bash
    uvicorn main:app --reload
    ```
    *The API will be available at `http://localhost:8000`.*

### 3. Frontend Setup (Next.js)

1.  Navigate to the frontend directory.
2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```
3.  Set up environment variables. Create a `.env` file in the frontend directory and add:
    ```env
    NEXT_PUBLIC_API_URL=http://localhost:8000
    NEXT_PUBLIC_CONTRACT_ADDRESS=your_deployed_contract_address_here
    DATABASE_URL="your_database_url_here" # For Prisma
    ```
4.  Generate Prisma client and push schema (if applicable):
    ```bash
    npx prisma generate
    npx prisma db push
    ```
5.  Start the development server:
    ```bash
    npm run dev
    # or
    yarn dev
    ```
    *The frontend will be available at `http://localhost:3000`.*

## 🧪 Testing the System

### Threat Detection Simulation
Use the provided `attack_simulator.py` in the root directory to test the QSVM threat detection capabilities.

```bash
python attack_simulator.py
```
This script will send simulated threat data to the backend `/api/predict-threat` endpoint and print the predictions.

### Document Signing
1.  Open the web interface at `http://localhost:3000`.
2.  Connect your Web3 wallet.
3.  Upload a document to sign. The frontend will communicate with the backend `/api/sign-document` endpoint to generate a quantum-safe signature.
4.  The signature will be logged on the local Hardhat blockchain via the `SignatureRegistry.sol` contract.

## 📜 License

MIT License
