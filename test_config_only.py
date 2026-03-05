import sys
import os
backend_path = r"c:\Users\USER\OneDrive\Desktop\Antigravity project\video-editor\Video-Editor-App\backend"
sys.path.append(backend_path)

try:
    from core.config import settings
    print(f"CORS ORIGINS: {settings.cors_allowed_origins}")
    if isinstance(settings.cors_allowed_origins, list):
        print("TYPE CHECK: SUCCESS (is list)")
    else:
        print(f"TYPE CHECK: FAILED (is {type(settings.cors_allowed_origins)})")
    print("SUCCESS")
except Exception as e:
    print(f"FAILED: {e}")
