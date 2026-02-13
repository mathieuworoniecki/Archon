"""
Archon Backend - Configuration
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App
    app_name: str = "Archon"
    debug: bool = False
    
    # Gemini AI
    gemini_api_key: str = ""
    embedding_model: str = "models/gemini-embedding-001"
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # Meilisearch
    meilisearch_url: str = "http://localhost:7700"
    meilisearch_api_key: str = ""
    meilisearch_index: str = "documents"
    
    # Qdrant
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "documents"
    
    # Database
    database_url: str = "postgresql://archon:archon@postgres:5432/archon"
    
    # Scan Configuration
    scan_root_path: str = "./documents"
    chunk_size: int = 500
    chunk_overlap: int = 50
    
    # Tesseract
    tesseract_cmd: str = "/usr/bin/tesseract"
    
    # JWT Authentication
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 30

    # Dev: disable auth entirely (DISABLE_AUTH=true in .env)
    disable_auth: bool = False

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost:3100,http://127.0.0.1:5173"
    
    # Paths
    @property
    def data_dir(self) -> Path:
        path = Path("./data")
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance with startup validation."""
    s = Settings()
    if not s.disable_auth and not s.jwt_secret_key:
        raise RuntimeError(
            "JWT_SECRET_KEY is required when auth is enabled. "
            "Set JWT_SECRET_KEY in .env or set DISABLE_AUTH=true for development."
        )
    if s.jwt_secret_key and len(s.jwt_secret_key) < 32:
        logger.warning("JWT_SECRET_KEY is shorter than 32 characters — consider using a stronger secret")
    return s
