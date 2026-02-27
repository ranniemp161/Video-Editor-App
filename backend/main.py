# FastAPI Application Entry Point
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from db import SessionLocal, engine, Base, RoughCutResult
from api import projects_router, transcripts_router, editing_router, system_router
from api.projects import cleanup_orphaned_files
from ml_scheduler import MLScheduler

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
app.include_router(system_router)
app.include_router(projects_router)
app.include_router(transcripts_router)
app.include_router(editing_router)

# ML Scheduler instance
scheduler = MLScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown events."""
    # Startup
    db = SessionLocal()
    try:
        cleanup_orphaned_files(db)
    finally:
        db.close()
        
    try:
        # Start ML Scheduler (checks every hour)
        scheduler.start(interval_seconds=3600)
    except Exception as e:
        logger.error(f"Failed to start ML scheduler: {e}")
        
    yield
    
    # Shutdown
    if scheduler:
        scheduler.stop()

app = FastAPI(title="Video Editor API", lifespan=lifespan)
app.state.scheduler = scheduler


# Note: Root, ml-status, and transcription-progress routes have been moved to api/system.py


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    # use_reloader=False to prevent scheduler from running twice in dev
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
