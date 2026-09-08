import os
import numpy as np
import joblib
from sklearn.datasets import make_classification
from sklearn.preprocessing import MinMaxScaler
from qiskit.circuit.library import ZZFeatureMap
from qiskit_machine_learning.kernels import FidelityQuantumKernel
from qiskit_machine_learning.algorithms import QSVC

def main():
    print("Starting QSVC Training...")
    
    # 1. Generate synthetic dataset for network metadata
    # Feature 0: payload_size, Feature 1: request_frequency_hz
    print("Generating custom dataset...")
    np.random.seed(42)
    
    # Class 0: Normal (1KB - 5MB payload, > 2 seconds between requests)
    normal_payloads = np.random.uniform(1000, 5000000, 100)
    normal_times = np.random.uniform(2.0, 10.0, 100)
    normal_X = np.column_stack((normal_payloads, normal_times))
    normal_y = np.zeros(100)
    
    # Class 1: Attack (either > 50MB payload OR < 0.1s frequency)
    # Type A: Large payloads
    attack_payloads_A = np.random.uniform(50000000, 100000000, 50)
    attack_times_A = np.random.uniform(2.0, 10.0, 50)
    # Type B: DoS / Brute-force
    attack_payloads_B = np.random.uniform(1000, 5000000, 50)
    attack_times_B = np.random.uniform(0.01, 0.1, 50)
    
    attack_X = np.column_stack((
        np.concatenate([attack_payloads_A, attack_payloads_B]),
        np.concatenate([attack_times_A, attack_times_B])
    ))
    attack_y = np.ones(100)
    
    X = np.vstack((normal_X, attack_X))
    y = np.concatenate((normal_y, attack_y))
    
    # Shuffle dataset
    shuffle_idx = np.random.permutation(len(y))
    X = X[shuffle_idx]
    y = y[shuffle_idx]
    
    # 2. Normalize data for quantum encoding (0 to 2π is standard for angle embedding)
    print("Scaling features...")
    scaler = MinMaxScaler(feature_range=(0, 2 * np.pi))
    X_scaled = scaler.fit_transform(X)
    
    # 3. Construct Quantum Feature Map & Kernel
    print("Setting up Quantum Feature Map and FidelityKernel...")
    feature_map = ZZFeatureMap(feature_dimension=2, reps=2, entanglement='linear')
    qkernel = FidelityQuantumKernel(feature_map=feature_map)
    
    # 4. Initialize and Train QSVC
    print("Training QSVC (this may take a minute depending on hardware)...")
    qsvc = QSVC(quantum_kernel=qkernel)
    qsvc.fit(X_scaled, y)
    print(f"Training Complete. Accuracy: {qsvc.score(X_scaled, y):.2f}")
    
    # 5. Save Model and Scaler
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    os.makedirs(models_dir, exist_ok=True)
    
    model_path = os.path.join(models_dir, 'qsvm_model.joblib')
    scaler_path = os.path.join(models_dir, 'scaler.joblib')
    
    joblib.dump(qsvc, model_path)
    joblib.dump(scaler, scaler_path)
    
    print(f"Model saved to {model_path}")
    print(f"Scaler saved to {scaler_path}")

if __name__ == "__main__":
    main()
