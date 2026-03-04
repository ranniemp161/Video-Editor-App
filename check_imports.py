import os
import re

backend_dir = r"c:\Users\USER\OneDrive\Desktop\Antigravity project\video-editor\Video-Editor-App\backend"

for root, dirs, files in os.walk(backend_dir):
    for file in files:
        if file.endswith(".py"):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                if "Session" in content and "from sqlalchemy.orm import Session" not in content:
                    # Ignore it if it's just a local variable or string
                    # But if it's used in a type hint, it's likely the culprit
                    if re.search(r":\s*Session", content) or re.search(r"->\s*Session", content):
                        print(f"Potential issue in: {path}")
