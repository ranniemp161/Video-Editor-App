# Database connection and session management
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import logging

logger = logging.getLogger(__name__)

# Determine data directory with fallback for Docker environments
# Default path (used locally): ProjectRoot/data
default_data_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data"))

# Fallback path (used in Docker if root /data fails): ProjectRoot/backend/data
fallback_data_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data"))

DATA_DIR = os.getenv("DATA_DIR", default_data_dir)

try:
    os.makedirs(DATA_DIR, exist_ok=True)
except PermissionError:
    logger.warning(f"Permission denied creating {DATA_DIR}. Falling back to {fallback_data_dir}")
    DATA_DIR = fallback_data_dir
    os.makedirs(DATA_DIR, exist_ok=True)

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(DATA_DIR, 'projects.db')}")

# SQLite specific connection args
connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
