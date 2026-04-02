from fastapi import APIRouter, Request, Depends, HTTPException
import logging
import os
import shutil
from sqlalchemy.orm import Session
from db import get_db, Project, Segment, RoughCutResult
from core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["system"])

@router.get("/")
def read_root():
    """Health check endpoint."""
    return {"message": "Video Editor API"}

@router.post("/reset")
async def reset_system(request: Request, db: Session = Depends(get_db)):
    """
    NUCLEAR OPTION: Purge all projects, segments, and local media files.
    Use this to free up disk space and start fresh.
    """
    logger.warning("GLOBAL SYSTEM RESET INITIATED")
    
    try:
        # 1. Clear Database Tables
        # Because of cascade deletes, deleting projects should handle segments/results,
        # but we do it explicitly for safety and to handle orphaned records.
        db.query(RoughCutResult).delete()
        db.query(Segment).delete()
        db.query(Project).delete()
        db.commit()

        # 2. Clear Filesystem (Uploads)
        upload_dir = str(settings.upload_dir)
        if os.path.exists(upload_dir):
            for item in os.listdir(upload_dir):
                item_path = os.path.join(upload_dir, item)
                try:
                    if os.path.isdir(item_path):
                        shutil.rmtree(item_path)
                    else:
                        os.remove(item_path)
                except Exception as e:
                    logger.error(f"Failed to delete {item_path}: {e}")

        # 3. Clear In-Memory State
        request.app.state.transcription_progress = {}
        
        return {"success": True, "message": "System reset successfully. All data purged."}
    except Exception as e:
        logger.error(f"System reset failed: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")

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
