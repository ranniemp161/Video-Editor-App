# Project CRUD endpoints
import os
import uuid
import shutil
import time
import logging
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session

from db import get_db, Project, Segment as DBSegment
from schemas import Segment

logger = logging.getLogger(__name__)

router = APIRouter(tags=["projects"])

UPLOAD_DIR = "public/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def cleanup_orphaned_files(db: Session):
    """Delete files in UPLOAD_DIR that are not referenced in the database."""
    try:
        # Get all valid project IDs
        valid_project_ids = {p.id for p in db.query(Project).all()}
        
        now = time.time()
        
        if not os.path.exists(UPLOAD_DIR):
            return

        for item in os.listdir(UPLOAD_DIR):
            item_path = os.path.join(UPLOAD_DIR, item)
            
            # Handle project directories (named by UUID)
            if os.path.isdir(item_path):
                # Check if directory name (UUID) is a valid project ID
                if item not in valid_project_ids and (now - os.path.getmtime(item_path)) > 600:
                    logger.info(f"Cleaning up orphaned project directory: {item}")
                    try:
                        shutil.rmtree(item_path)
                    except Exception as e:
                        logger.error(f"Failed to delete directory {item}: {e}")
                continue
            
            # Handle legacy flat files or other junk
            if (now - os.path.getmtime(item_path)) > 3600: # 1 hour grace for root files
                 logger.info(f"Cleaning up old root file: {item}")
                 try:
                    os.remove(item_path)
                 except Exception:
                    pass
    except Exception as e:
        logger.error(f"Orphan cleanup failed: {e}")


@router.post("/upload")
async def upload_video(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a video file and create a new project."""
    try:
        file_id = str(uuid.uuid4())
        project_dir = os.path.join(UPLOAD_DIR, file_id)
        os.makedirs(project_dir, exist_ok=True)
        
        file_path = os.path.join(project_dir, file.filename)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        db_project = Project(
            id=file_id,
            mediaPath=file_path,
            duration=0.0,
            originalFileName=file.filename,
            createdAt=time.time()
        )
        db.add(db_project)
        db.commit()
        
        return {"success": True, "projectId": file_id, "filePath": f"/uploads/{file_id}/{file.filename}"}
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/project/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    """Get project details by ID."""
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {
        "projectId": db_project.id,
        "mediaPath": db_project.mediaPath,
        "duration": db_project.duration,
        "originalFileName": db_project.originalFileName,
        "segments": [
            {
                "start": s.start,
                "end": s.end,
                "text": s.text,
                "type": s.type,
                "isDeleted": s.isDeleted
            } for s in db_project.segments
        ]
    }


@router.delete("/project/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    """Delete a project and its associated files."""
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        logger.info(f"Delete requested for non-existent project {project_id}. Returning success.")
        return {"success": True, "message": "Project already deleted"}
    
    # Delete associated files and directory
    try:
        project_dir = os.path.join(UPLOAD_DIR, project_id)
        if os.path.exists(project_dir):
            shutil.rmtree(project_dir)
            logger.info(f"Deleted project directory: {project_dir}")
    except Exception as e:
        logger.error(f"Error deleting files for project {project_id}: {e}")
        logger.error(f"Error deleting files for project {project_id}: {e}")

    # Delete from DB
    try:
        db.query(DBSegment).filter(DBSegment.projectId == project_id).delete()
        db.delete(db_project)
        db.commit()
    except Exception as e:
        logger.error(f"Error deleting project from DB {project_id}: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during deletion: {str(e)}")
    
    return {"success": True}


@router.put("/project/{project_id}/segments")
async def update_segments(project_id: str, segments: List[Segment], db: Session = Depends(get_db)):
    """Update segments for a project."""
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Replace segments
    db.query(DBSegment).filter(DBSegment.projectId == project_id).delete()
    for s in segments:
        db_seg = DBSegment(
            projectId=project_id,
            start=s.start,
            end=s.end,
            text=s.text,
            type=s.type,
            isDeleted=s.isDeleted
        )
        db.add(db_seg)
    
    db.commit()
    return {"success": True}
