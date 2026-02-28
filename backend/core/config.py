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
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

settings = Settings()
