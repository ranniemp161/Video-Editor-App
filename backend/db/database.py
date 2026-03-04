# Database connection and session management
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import logging

logger = logging.getLogger(__name__)

# Constants for testability and configuration
# Default path: ProjectRoot/data (used locally)
default_data_dir = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data"))

# Fallback path: Current working directory/data (guaranteed writable in many environments)
fallback_data_dir = os.path.abspath(os.path.join(os.getcwd(), "data"))

DATA_DIR = os.getenv("DATA_DIR", default_data_dir)

def ensure_data_dir():
    """Ensure data directory exists with fallback."""
    global DATA_DIR
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
    except (PermissionError, OSError) as e:
        logger.warning(f"Failed to create DATA_DIR {DATA_DIR} ({e}). Falling back to {fallback_data_dir}")
        DATA_DIR = fallback_data_dir
        os.makedirs(DATA_DIR, exist_ok=True)

# Ensure directory is ready
ensure_data_dir()

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
