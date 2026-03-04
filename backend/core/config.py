from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
from typing import Optional

class Settings(BaseSettings):
    # App Settings
    app_title: str = "Video Editor API"
    port: int = 8000
    host: str = "0.0.0.0"
    debug: bool = False

    # AI Configuration
    gemini_api_key: Optional[str] = None
    
    # Path Configuration
    base_dir: Path = Path(__file__).resolve().parent.parent
    data_dir: Path = base_dir / "data"
    model_dir: Path = base_dir / "models"
    
    # Store uploads one directory up from backend to match frontend's "public/uploads" expectations
    upload_dir: Path = base_dir.parent / "public" / "uploads"
    
    # Security: Maximum file upload size to prevent DoS attacks
    max_upload_size_mb: int = 500
    
    # Global Authentication Password (REQUIRED — no default for security)
    app_password: str
    
    # JWT signing secret (REQUIRED — generate with: python -c "import secrets; print(secrets.token_hex(32))")
    jwt_secret: str
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

settings = Settings()
