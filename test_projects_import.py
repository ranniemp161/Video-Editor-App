import sys
import os

backend_path = r"c:\Users\USER\OneDrive\Desktop\Antigravity project\video-editor\Video-Editor-App\backend"
sys.path.append(backend_path)

try:
    from api.projects import router as projects_router
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {e}")
    sys.exit(1)
