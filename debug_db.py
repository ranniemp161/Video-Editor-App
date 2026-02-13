import sqlite3
import pandas as pd
import os
import sys

# Try multiple possible locations for the DB
db_paths = [
    "backend/videos.db",
    "Video-Editor-App/backend/videos.db", 
    "videos.db"
]

found_db = None
for p in db_paths:
    if os.path.exists(p):
        found_db = p
        break

if not found_db:
    print(f"Database not found in: {db_paths}")
    sys.exit(1)

print(f"Found DB at: {found_db}")
conn = sqlite3.connect(found_db)
try:
    df = pd.read_sql_query("SELECT id, mediaPath, originalFileName FROM projects", conn)
    # Print as CSV to avoid truncation
    print(df.to_csv(index=False))
except Exception as e:
    print(f"Error querying DB: {e}")
finally:
    conn.close()
