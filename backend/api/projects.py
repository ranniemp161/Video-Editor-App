# Project CRUD endpoints
import os
import uuid
import shutil
import time
import logging
from typing import List
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request
from core.limiter import limiter
from db import Project, Segment as DBSegment, RoughCutResult, get_db
from schemas import Segment
from core.config import settings

logger = logging.getLogger(__name__)


router = APIRouter(tags=["projects"])

UPLOAD_DIR = str(settings.upload_dir)
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


import re

def secure_filename(filename: str) -> str:
    """Return a secure version of a filename for file system storage."""
    # Keep only alphanumeric, dot, dash, and underscore. Strip path dividers.
    safe_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', os.path.basename(filename))
    # Prevent empty or hidden-only names
    if not safe_name or safe_name.startswith('.'):
        safe_name = "upload_" + str(uuid.uuid4())[:8] + ".tmp"
    return safe_name

@router.post("/upload")
@limiter.limit("5/minute")
async def upload_video(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a video file and create a new project."""
    try:
        # Pre-emptive check using Content-Length header (if provided by client)
        content_length = request.headers.get("content-length")
        max_bytes = settings.max_upload_size_mb * 1024 * 1024
        if content_length and int(content_length) > max_bytes:
            raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {settings.max_upload_size_mb}MB.")

        file_id = str(uuid.uuid4())
        project_dir = os.path.join(UPLOAD_DIR, file_id)
        os.makedirs(project_dir, exist_ok=True)
        
        # Prevent Path Traversal by securing the uploaded filename
        safe_name = secure_filename(file.filename)
        file_path = os.path.join(project_dir, safe_name)
        
        # Stream file in chunks to prevent memory RAM exhaustion and enforce true size limits
        bytes_written = 0
        chunk_size = 1024 * 1024  # 1MB chunks
        
        with open(file_path, "wb") as buffer:
            while True:
                chunk = file.file.read(chunk_size)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    buffer.close()
                    os.remove(file_path)
                    shutil.rmtree(project_dir, ignore_errors=True)
                    raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {settings.max_upload_size_mb}MB.")
                buffer.write(chunk)
            
        db_project = Project(
            id=file_id,
            mediaPath=file_path,
            duration=0.0,
            originalFileName=file.filename,
            createdAt=time.time()
        )
        db.add(db_project)
        db.commit()
        
        return {"success": True, "projectId": file_id, "filePath": f"/uploads/{file_id}/{safe_name}"}
    except HTTPException:
        # Re-raise HTTP exceptions (like our 413) so they aren't caught by the generic handler
        raise
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
    # Prevent directory climbing / path traversal
    if ".." in project_id or "/" in project_id or "\\" in project_id:
        raise HTTPException(status_code=400, detail="Invalid project ID format")
        
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
