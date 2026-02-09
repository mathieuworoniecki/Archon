"""
Archon Backend - Configuration
"""
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App
    app_name: str = "Archon"
    debug: bool = True
    
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
    tesseract_cmd: str = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    
    # JWT Authentication
    jwt_secret_key: str = "archon-change-me-in-production-use-a-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 30
    
    # Dev: disable auth entirely (DISABLE_AUTH=true in .env)
    disable_auth: bool = False
    
    # Paths
    @property
    def data_dir(self) -> Path:
        path = Path("./data")
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
