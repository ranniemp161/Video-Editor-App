"""
Simple test to verify backend is working
"""
import sys
import requests

url = "http://localhost:8000/analyze-thoughts"

sample_words = [
    {"word": "Hello", "start": 0.0, "end": 0.5},
    {"word": "world", "start": 0.5, "end": 1.0},
]

try:
    response = requests.post(url, json={"words": sample_words})
    if response.status_code == 200:
        data = response.json()
        print(f"SUCCESS: Got {len(data['thoughts'])} thoughts")
        sys.exit(0)
    else:
        print(f"FAILED: Status {response.status_code}")
        sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)
