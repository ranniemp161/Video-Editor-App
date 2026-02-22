# FastAPI Application Entry Point
import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from db import SessionLocal, engine, Base, RoughCutResult
from api import projects_router, transcripts_router, editing_router
from api.projects import cleanup_orphaned_files

# Create tables (RoughCutResult must be imported above for SQLAlchemy to see it)
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Video Editor API")

# CORS configuration - allow all origins for cloud deployment
# Note: allow_credentials must be False when using wildcard origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers
app.include_router(projects_router)
app.include_router(transcripts_router)
app.include_router(editing_router)

# ML Scheduler
from ml_scheduler import MLScheduler
scheduler = MLScheduler()

@app.on_event("startup")
def startup_event():
    """Run cleanup and start ML scheduler."""
    db = SessionLocal()
    try:
        cleanup_orphaned_files(db)
    finally:
        db.close()
        
    # Start ML Scheduler (checks every hour)
    try:
        scheduler.start(interval_seconds=3600)
    except Exception as e:
        logger.error(f"Failed to start ML scheduler: {e}")


@app.on_event("shutdown")
def shutdown_event():
    """Stop ML scheduler."""
    if scheduler:
        scheduler.stop()


@app.get("/")
def read_root():
    """Health check endpoint."""
    return {"message": "Video Editor API"}


@app.get("/ml-status")
def get_ml_status():
    """Get current ML training status and metrics."""
    try:
        state = scheduler._load_state()
        return {
            "status": "active" if scheduler.is_running else "stopped",
            "last_training": state.get("last_trained_timestamp"),
            "sample_count": state.get("last_trained_count"),
            "metrics": state.get("latest_metrics", {})
        }
    except Exception as e:
        return {"error": str(e)}


@app.get("/transcription-progress")
async def get_transcription_progress(videoPath: str):
    """Return real transcription progress if available."""
    from api.transcripts import TRANSCRIPTION_PROGRESS
    progress = TRANSCRIPTION_PROGRESS.get(videoPath, 0)
    return {"progress": progress, "status": "processing" if progress < 100 else "completed"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    # use_reloader=False to prevent scheduler from running twice in dev
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
