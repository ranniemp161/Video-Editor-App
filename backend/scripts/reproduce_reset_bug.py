import urllib.request
import urllib.parse
import json
import os
import sys

API_URL = "http://localhost:8000"

def run_test():
    print(f"Testing API at {API_URL}")
    
    # 1. Health check
    try:
        with urllib.request.urlopen(f"{API_URL}/") as response:
            print("Health check: OK")
    except Exception as e:
        print(f"Health check failed: {e}")
        return

    # 2. Create dummy file
    filename = "test_dummy.txt"
    with open(filename, "wb") as f:
        f.write(b"dummy data")

    try:
        # 3. Upload file
        print("Uploading file...")
        # Since urllib is hard for multipart, we use a simple boundary approach or check if requests is available
        try:
            import requests
        except ImportError:
            print("Requests library not found. Please install requests to run this test properly or run 'pip install requests'.")
            return

        with open(filename, 'rb') as f:
            files = {'file': (filename, f, 'text/plain')}
            res = requests.post(f"{API_URL}/upload", files=files)
        
        if res.status_code != 200:
            print(f"Upload failed: {res.status_code} {res.text}")
            return
            
        data = res.json()
        project_id = data.get("projectId")
        print(f"Project created with ID: {project_id}")

        # 4. Verify project exists
        res = requests.get(f"{API_URL}/project/{project_id}")
        if res.status_code != 200:
            print(f"Get project failed: {res.status_code}")
            return
        print("Project verified exists.")

        # 5. Delete project (The Reset Action)
        print("Attempting to delete project...")
        res = requests.delete(f"{API_URL}/project/{project_id}")
        
        if res.status_code != 200:
            print(f"Delete failed: {res.status_code} {res.text}")
            return
        
        print(f"Delete response: {res.json()}")

        # 6. Verify project is gone
        res = requests.get(f"{API_URL}/project/{project_id}")
        if res.status_code == 404:
            print("Success! Project verified deleted (404).")
        else:
            print(f"Failure! Project still exists or error: {res.status_code}")

    except Exception as e:
        print(f"Test failed with exception: {e}")
    finally:
        if os.path.exists(filename):
            os.remove(filename)

if __name__ == "__main__":
    run_test()
