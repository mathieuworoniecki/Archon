"""
War Room Backend - Configuration
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App
    app_name: str = "War Room"
    debug: bool = True
    
    # Gemini AI
    gemini_api_key: str = ""
    embedding_model: str = "models/text-embedding-004"
    
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
    database_url: str = "sqlite:///./data/finders.db"
    
    # Scan Configuration
    scan_root_path: str = "./documents"
    chunk_size: int = 500
    chunk_overlap: int = 50
    
    # Tesseract
    tesseract_cmd: str = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    
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
