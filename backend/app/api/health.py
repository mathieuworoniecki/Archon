"""
Archon Backend - Health Check Endpoint
"""
import logging
from fastapi import APIRouter
from sqlalchemy import text

from ..database import engine
from ..config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/")
async def health_check():
    """
    Health check endpoint.
    Returns status of all services: database, Redis, Meilisearch, Qdrant.
    """
    checks = {}
    overall = True
    
    # Database
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"
        overall = False
    
    # Redis
    try:
        import redis
        r = redis.from_url(settings.redis_url, socket_timeout=2)
        r.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "unavailable"
        # Redis is optional (graceful degradation)
    
    # Meilisearch
    try:
        import httpx
        resp = httpx.get(f"{settings.meilisearch_url}/health", timeout=2)
        checks["meilisearch"] = "ok" if resp.status_code == 200 else f"status {resp.status_code}"
    except Exception:
        checks["meilisearch"] = "unavailable"
    
    # Qdrant
    try:
        import httpx
        resp = httpx.get(f"{settings.qdrant_url}/collections", timeout=2)
        checks["qdrant"] = "ok" if resp.status_code == 200 else f"status {resp.status_code}"
    except Exception:
        checks["qdrant"] = "unavailable"
    
    return {
        "status": "healthy" if overall else "degraded",
        "services": checks,
    }
