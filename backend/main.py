# FastAPI Application Entry Point
import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from db import SessionLocal, engine, Base
from api import projects_router, transcripts_router, editing_router
from api.projects import cleanup_orphaned_files

# Create tables
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Video Editor API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(projects_router)
app.include_router(transcripts_router)
app.include_router(editing_router)


@app.on_event("startup")
def startup_event():
    """Run cleanup on startup."""
    db = SessionLocal()
    try:
        cleanup_orphaned_files(db)
    finally:
        db.close()


@app.get("/")
def read_root():
    """Health check endpoint."""
    return {"message": "Video Editor API"}


@app.get("/transcription-progress")
async def get_transcription_progress(videoPath: str):
    """Stub endpoint for compatibility."""
    return {"progress": 0, "status": "processing"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
