from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel, Field
import random
import string
import os
import hashlib
import joblib
import numpy as np

# Load QSVC model and scaler globally
models_dir = os.path.join(os.path.dirname(__file__), 'models')
model_path = os.path.join(models_dir, 'qsvm_model.joblib')
scaler_path = os.path.join(models_dir, 'scaler.joblib')

qsvc_model = None
scaler = None

try:
    qsvc_model = joblib.load(model_path)
    scaler = joblib.load(scaler_path)
    print("QSVC model and scaler loaded successfully.")
except Exception as e:
    print(f"Warning: Could not load QSVC model or scaler. Falling back to mock scores. Error: {e}")

# FIX C2 & H2: Initialize ML-DSA-65 globally as a singleton
OQS_AVAILABLE = False
signer_instance = None
public_key_hex = None

try:
    import oqs
    OQS_AVAILABLE = True
    signer_instance = oqs.Signature('ML-DSA-65')
    _pk = signer_instance.generate_keypair()
    public_key_hex = _pk.hex()
    print("ML-DSA-65 signer initialized successfully.")
except Exception as e:
    print(f"Warning: liboqs-python could not load. Falling back to mock signatures. Error: {e}")

app = FastAPI(title="Quantum-Inspired Cyber Threat Detection API")


class VerifyRequest(BaseModel):
    document_hash: str  # hex string, with or without 0x prefix
    signature: str       # hex-encoded ML-DSA-65 signature
    public_key: str      # hex-encoded ML-DSA-65 public key


@app.post("/api/verify-signature")
async def verify_signature_endpoint(request: VerifyRequest):
    """
    Verify an ML-DSA-65 (CRYSTALS-Dilithium) digital signature.
    Runs: oqs.Signature('ML-DSA-65').verify(doc_hash_bytes, signature_bytes, public_key_bytes)
    """
    if not OQS_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="liboqs is not available on this server. Cannot perform real verification."
        )

    try:
        # IMPORTANT: sign() encodes the hash string as UTF-8 bytes:
        #   signer_instance.sign(document_hash.encode('utf-8'))
        # So verify() MUST use the same encoding — NOT bytes.fromhex() which
        # produces completely different bytes and causes every valid sig to fail.
        doc_hash_bytes   = request.document_hash.encode('utf-8')
        signature_bytes  = bytes.fromhex(request.signature)
        public_key_bytes = bytes.fromhex(request.public_key)

        # Real ML-DSA-65 verification
        verifier = oqs.Signature('ML-DSA-65')
        is_valid = verifier.verify(doc_hash_bytes, signature_bytes, public_key_bytes)


        return {
            "valid": bool(is_valid),
            "algorithm": "ML-DSA-65",
            "document_hash": request.document_hash,
            "status": "SIGNATURE_VALID" if is_valid else "SIGNATURE_INVALID",
            "mode": "liboqs"
        }
    except ValueError as e:
        # Bad hex encoding, wrong key size, etc.
        return {
            "valid": False,
            "algorithm": "ML-DSA-65",
            "document_hash": request.document_hash,
            "status": "VERIFICATION_ERROR",
            "error": f"Invalid input: {e}",
            "mode": "liboqs"
        }
    except Exception as e:
        return {
            "valid": False,
            "algorithm": "ML-DSA-65",
            "document_hash": request.document_hash,
            "status": "VERIFICATION_ERROR",
            "error": str(e),
            "mode": "liboqs"
        }

class ThreatRequest(BaseModel):
    ip_address: str
    payload_size: int = Field(..., ge=0, le=100_000_000)
    time_since_last_req: float = Field(..., ge=0.001)

@app.post("/api/predict-threat")
async def predict_threat(request: ThreatRequest):
    """
    Mock endpoint for Qiskit QSVC Threat Prediction.
    Accepts IP, payload size, and time since last request.
    Returns a threat score between 0.0 and 1.0.
    """
    # Real QSVC Inference if models are loaded
    if qsvc_model and scaler:
        try:
            # FIX C3: Clip features to training bounds before scaling to prevent angle wrap-around
            features = np.array([[request.payload_size, request.time_since_last_req]])
            features = np.clip(features, a_min=[1000, 0.01], a_max=[100_000_000, 10.0])
            scaled_features = scaler.transform(features)
            
            # Predict (Returns [prob_class_0, prob_class_1])
            # Assuming class 1 is the anomaly/threat class based on our synthetic dataset
            # QSVC predict_proba might not be directly available for some Fidelity kernels depending on backend,
            # but scikit-learn compatible QSVC supports decision_function or we can use the prediction
            prediction = qsvc_model.predict(scaled_features)[0]
            
            # Since QSVC is a classifier, if we want a continuous score we can use decision_function if available
            # Let's use a simpler heuristic for continuous score if it's binary output
            if hasattr(qsvc_model, "predict_proba"):
                threat_score = float(qsvc_model.predict_proba(scaled_features)[0][1])
            elif hasattr(qsvc_model, "decision_function"):
                # Normalize decision function to 0-1
                dist = qsvc_model.decision_function(scaled_features)[0]
                threat_score = float(1 / (1 + np.exp(-dist))) # sigmoid
            else:
                threat_score = 0.9 if prediction == 1 else 0.1
                
            return {
                "threat_score": threat_score,
                "status": "success",
                "mode": "qsvc"
            }
        except Exception as e:
            print(f"QSVC Inference error: {e}")
            # Fall through to mock

    # Fallback mock score
    mock_score = random.uniform(0.0, 1.0)
    
    return {
        "threat_score": mock_score,
        "status": "success",
        "mode": "mock"
    }

@app.post("/api/sign-document")
async def sign_document(file: UploadFile = File(None), document_hash: str = Form(None)):
    """
    ML-DSA-65 (CRYSTALS-Dilithium) digital signature generation.
    Uses a global singleton signer initialized at startup.
    """
    if not document_hash:
        raise HTTPException(status_code=400, detail="document_hash is required")

    if OQS_AVAILABLE and signer_instance:
        try:
            # Sign using the global ML-DSA-65 instance (FIX C2 + H2)
            signature = signer_instance.sign(document_hash.encode('utf-8'))
            
            return {
                "signature": signature.hex(),
                "public_key": public_key_hex,
                "algorithm": "ML-DSA-65",
                "status": "success",
                "mode": "liboqs"
            }
        except Exception as e:
            print(f"liboqs signature error: {e}")
            # Fall through to mock

    # Generate a random hex string as a mock signature fallback
    mock_sig = ''.join(random.choices(string.hexdigits.lower(), k=128))
    
    return {
        "signature": f"mldsa_{mock_sig}",
        "algorithm": "ML-DSA-65",
        "status": "success",
        "mode": "mock"
    }
