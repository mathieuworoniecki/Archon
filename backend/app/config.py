"""
Archon Backend - Configuration
"""
from pathlib import Path
from pydantic import Field
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

    # RAG reranker (feature flagged)
    rag_rerank_enabled: bool = False
    rag_rerank_top_n: int = 50
    rag_rerank_top_k_out: int = 10
    rag_rerank_model: str = "gemini-2.0-flash"
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    celery_visibility_timeout_seconds: int = 172800  # 48h for very long scans
    
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
    # Compat: some environments (and the repo `.env`) use DOCUMENTS_PATH.
    # Keep this as a separate setting to avoid settings validation failures and
    # to allow `utils.paths.get_scan_root()` to honor it.
    documents_path: str = Field(default="", description="Optional root path for documents (env: DOCUMENTS_PATH)")
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
    
    # `.env` may include variables for other services (compose), don't crash on unknown keys.
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


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
