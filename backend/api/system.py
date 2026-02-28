from fastapi import APIRouter, Request
import logging

logger = logging.getLogger(__name__)

router = APIRouter(tags=["system"])

# Progress tracking moved to app.state

@router.get("/")
def read_root():
    """Health check endpoint."""
    return {"message": "Video Editor API"}

@router.get("/ml-status")
def get_ml_status(request: Request):
    """Get current ML training status and metrics."""
    scheduler = request.app.state.scheduler
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

@router.get("/transcription-progress")
async def get_transcription_progress(videoPath: str, request: Request):
    """Return real transcription progress if available."""
    progress = request.app.state.transcription_progress.get(videoPath, 0)
    return {"progress": progress, "status": "processing" if progress < 100 else "completed"}
