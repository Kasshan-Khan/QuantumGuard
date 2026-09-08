import urllib.request
import urllib.error
import json
import random
import time

NEXTJS_API_URL = "http://localhost:3000/api/process-signature"

def run_attack_simulation():
    print(f"Starting attack simulation targeting {NEXTJS_API_URL}...")
    
    for i in range(50):
        # Simulate unusual traffic (large payload, short interval)
        payload = {
            "ip_address": f"192.168.1.{random.randint(2, 254)}",
            "payload_size": random.randint(1000000, 5000000),  # Unusually large payload
            "time_since_last_req": random.uniform(0.01, 0.1), # Very short interval
            "document_hash": f"mock_hash_{i}"
        }
        
        try:
            print(f"[{i+1}/50] Sending request with payload size: {payload['payload_size']}...")
            data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(NEXTJS_API_URL, data=data, headers={'Content-Type': 'application/json'})
            
            with urllib.request.urlopen(req, timeout=5) as response:
                print(f"Response ({response.status}): {response.read().decode('utf-8')}")
        except urllib.error.URLError as e:
            print(f"Request failed: {e}")
        except Exception as e:
            print(f"Request failed: {e}")
        
        # Small delay to prevent local port exhaustion or instant rejection, but still rapid
        time.sleep(0.1)
        
    print("Attack simulation complete.")

if __name__ == "__main__":
    run_attack_simulation()
