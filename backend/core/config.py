from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
from typing import Optional, Union, Any
from pydantic import field_validator

class Settings(BaseSettings):
    # App Settings
    app_title: str = "Video Editor API"
    port: int = 8000
    host: str = "0.0.0.0"
    debug: bool = False

    # AI Configuration
    gemini_api_key: Optional[str] = None
    
    # CORS Configuration
    cors_allowed_origins: Any = []
    
    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v
    
    # Path Configuration
    base_dir: Path = Path(__file__).resolve().parent.parent
    data_dir: Path = base_dir / "data"
    model_dir: Path = base_dir / "models"
    
    # Store uploads within the backend directory for Docker/Render compatibility
    upload_dir: Path = base_dir / "public" / "uploads"
    
    # Security: Maximum file upload size to prevent DoS attacks
    max_upload_size_mb: int = 500
    
    # Global Authentication Password (REQUIRED)
    app_password: str = "MISSING_IN_ENV"
    
    # JWT signing secret (REQUIRED)
    jwt_secret: str = "MISSING_IN_ENV"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

settings = Settings()
