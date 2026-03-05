import sys
import os
import traceback

backend_path = os.path.abspath("backend")
if backend_path not in sys.path:
    sys.path.append(backend_path)

print(f"Python Path: {sys.path}")
print(f"Working Directory: {os.getcwd()}")

try:
    print("Attempting to import api.projects...")
    import api.projects
    print("SUCCESS: api.projects imported")
    print(f"Router defined: {'router' in dir(api.projects)}")
except Exception as e:
    print("\n--- IMPORT FAILED ---")
    traceback.print_exc()
    print("---------------------\n")
    sys.exit(1)
