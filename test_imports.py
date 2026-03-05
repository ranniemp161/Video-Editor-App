import sys
import os

# Add backend to path
backend_path = r"c:\Users\USER\OneDrive\Desktop\Antigravity project\video-editor\Video-Editor-App\backend"
sys.path.append(backend_path)

try:
    print("Testing imports...")
    from api.projects import router as projects_router
    print("Successfully imported api.projects")
    from api.transcripts import router as transcripts_router
    print("Successfully imported api.transcripts")
    from api.auth import router as auth_router
    print("Successfully imported api.auth")
    from api.editing import router as editing_router
    print("Successfully imported api.editing")
    import main
    print("Successfully imported main")
    print("\nALL IMPORTS SUCCESSFUL!")
except Exception as e:
    print(f"\nIMPORT FAILED: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
