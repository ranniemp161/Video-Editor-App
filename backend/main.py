# FastAPI Application Entry Point
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import uvicorn

from db import SessionLocal, engine, Base, RoughCutResult
from api.projects import router as projects_router
from api.transcripts import router as transcripts_router
from api.editing import router as editing_router
from api.system import router as system_router
from api.auth import router as auth_router, verify_jwt_token
from api.projects import cleanup_orphaned_files
from ml_scheduler import MLScheduler
from core.config import settings

# Create tables (RoughCutResult must be imported above for SQLAlchemy to see it)
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Security configuration check
if settings.app_password == "MISSING_IN_ENV" or settings.jwt_secret == "MISSING_IN_ENV":
    logger.critical("MISSING SECURITY CONFIGURATION!")
    logger.critical("APP_PASSWORD or JWT_SECRET is not set in environment variables.")
    logger.critical("Please set these variables in your .env file or deployment dashboard (e.g., Render).")
    # In production, we should exit if these are missing, but for dev we might want to continue
    # with a warning. Given the user's focus on production deployment, let's be strict.
    if not settings.debug:
        import sys
        logger.critical("Exiting due to missing security configuration.")
        sys.exit(1)


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

# Rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration - restricted to frontend origins with specific methods/headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Content-Disposition"],
)

# Include routers with authentication protection where needed
app.include_router(system_router)  # System routes like health checks are public
app.include_router(auth_router)    # Auth routes (login) are public
app.include_router(projects_router, dependencies=[Depends(verify_jwt_token)])
app.include_router(transcripts_router, dependencies=[Depends(verify_jwt_token)])
app.include_router(editing_router, dependencies=[Depends(verify_jwt_token)])

# Note: Root, ml-status, and transcription-progress routes have been moved to api/system.py


if __name__ == "__main__":
    # use_reloader=False to prevent scheduler from running twice in dev
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)
