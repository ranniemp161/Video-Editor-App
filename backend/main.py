# FastAPI Application Entry Point
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from db import SessionLocal, engine, Base, RoughCutResult
from api.projects import router as projects_router
from api.transcripts import router as transcripts_router
from api.editing import router as editing_router
from api.system import router as system_router
from api.projects import cleanup_orphaned_files
from ml_scheduler import MLScheduler
from core.config import settings

# Create tables (RoughCutResult must be imported above for SQLAlchemy to see it)
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

app = FastAPI(title=settings.app_title, lifespan=lifespan)
app.state.scheduler = scheduler
app.state.transcription_progress = {}

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

# Note: Root, ml-status, and transcription-progress routes have been moved to api/system.py


if __name__ == "__main__":
    # use_reloader=False to prevent scheduler from running twice in dev
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)
