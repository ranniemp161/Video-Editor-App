# FastAPI Application Entry Point
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Header, HTTPException
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

def verify_app_password(x_app_password: str = Header(None)):
    """Global dependency to protect API routes with the configured app password."""
    if not x_app_password or x_app_password != settings.app_password:
        raise HTTPException(status_code=401, detail="Invalid or missing X-App-Password header")

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

# CORS configuration - securely restricted to the frontend origin
app.add_middleware(
    CORSMiddleware,
    # In production, this should be set via environment variables.
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Include routers with authentication protection where needed
app.include_router(system_router) # System routes like health checks are public
app.include_router(projects_router, dependencies=[Depends(verify_app_password)])
app.include_router(transcripts_router, dependencies=[Depends(verify_app_password)])
app.include_router(editing_router, dependencies=[Depends(verify_app_password)])

# Note: Root, ml-status, and transcription-progress routes have been moved to api/system.py


if __name__ == "__main__":
    # use_reloader=False to prevent scheduler from running twice in dev
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)
