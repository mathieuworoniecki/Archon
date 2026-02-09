"""
Redis-backed rate limiter for FastAPI.
Falls back to in-memory sliding window if Redis is unavailable.
"""
import time
import logging
from collections import defaultdict
from fastapi import Request, HTTPException

logger = logging.getLogger(__name__)

# Try to import redis; fall back gracefully
try:
    import redis as _redis
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False


class RateLimiter:
    """
    Sliding window rate limiter with Redis persistence.
    Falls back to in-memory storage if Redis is not configured or unreachable.
    
    Usage:
        limiter = RateLimiter(max_requests=10, window_seconds=60)
        
        @router.post("/endpoint")
        async def endpoint(request: Request):
            limiter.check(request)
            ...
    """
    
    def __init__(
        self,
        max_requests: int = 10,
        window_seconds: int = 60,
        prefix: str = "rl",
        redis_url: str | None = None,
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.prefix = prefix
        self._redis: _redis.Redis | None = None
        
        # Try to connect to Redis
        if redis_url and _REDIS_AVAILABLE:
            try:
                self._redis = _redis.Redis.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                logger.info("Rate limiter using Redis backend (%s)", redis_url)
            except Exception as exc:
                logger.warning("Redis unavailable for rate limiter (%s), using in-memory fallback", exc)
                self._redis = None
        
        # In-memory fallback
        self._memory: dict[str, list[float]] = defaultdict(list)
    
    def _get_client_key(self, request: Request) -> str:
        """Extract client identifier from request."""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
    
    def _check_redis(self, key: str) -> tuple[int, int]:
        """Check rate limit using Redis sorted set. Returns (count, retry_after)."""
        redis_key = f"{self.prefix}:{key}"
        now = time.time()
        cutoff = now - self.window_seconds
        
        pipe = self._redis.pipeline()
        # Remove expired entries
        pipe.zremrangebyscore(redis_key, "-inf", cutoff)
        # Add current request
        pipe.zadd(redis_key, {str(now): now})
        # Count requests in window
        pipe.zcard(redis_key)
        # Set TTL on the key
        pipe.expire(redis_key, self.window_seconds + 1)
        # Get oldest entry (for retry-after calculation)
        pipe.zrange(redis_key, 0, 0, withscores=True)
        
        results = pipe.execute()
        count = results[2]
        oldest = results[4]
        
        if count > self.max_requests:
            oldest_ts = oldest[0][1] if oldest else now
            retry_after = int(self.window_seconds - (now - oldest_ts)) + 1
            return count, max(1, retry_after)
        
        return count, 0
    
    def _check_memory(self, key: str) -> tuple[int, int]:
        """Check rate limit using in-memory storage. Returns (count, retry_after)."""
        now = time.time()
        cutoff = now - self.window_seconds
        
        # Cleanup expired
        self._memory[key] = [t for t in self._memory[key] if t > cutoff]
        if not self._memory[key]:
            del self._memory[key]
        
        timestamps = self._memory.get(key, [])
        
        if len(timestamps) >= self.max_requests:
            retry_after = int(self.window_seconds - (now - timestamps[0])) + 1
            return len(timestamps), max(1, retry_after)
        
        self._memory[key].append(now)
        return len(timestamps) + 1, 0
    
    def check(self, request: Request) -> None:
        """
        Check if the request is within rate limits.
        Raises HTTPException(429) if limit exceeded.
        """
        key = self._get_client_key(request)
        
        try:
            if self._redis:
                count, retry_after = self._check_redis(key)
            else:
                count, retry_after = self._check_memory(key)
        except Exception as exc:
            # If Redis fails mid-flight, fall back silently
            logger.warning("Rate limiter error (%s), allowing request", exc)
            return
        
        if retry_after > 0:
            logger.warning(
                "Rate limit exceeded for %s: %d/%d requests in %ds",
                key, count, self.max_requests, self.window_seconds
            )
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Retry in {retry_after}s.",
                headers={"Retry-After": str(retry_after)}
            )
    
    def get_remaining(self, request: Request) -> dict:
        """Get rate limit status for a client (for headers/debugging)."""
        key = self._get_client_key(request)
        now = time.time()
        
        if self._redis:
            redis_key = f"{self.prefix}:{key}"
            cutoff = now - self.window_seconds
            self._redis.zremrangebyscore(redis_key, "-inf", cutoff)
            count = self._redis.zcard(redis_key)
        else:
            cutoff = now - self.window_seconds
            self._memory[key] = [t for t in self._memory.get(key, []) if t > cutoff]
            if not self._memory[key]:
                del self._memory[key]
            count = len(self._memory.get(key, []))
        
        return {
            "limit": self.max_requests,
            "remaining": max(0, self.max_requests - count),
            "reset": self.window_seconds,
        }


def _get_redis_url() -> str | None:
    """Get Redis URL from settings."""
    try:
        from ..config import get_settings
        return get_settings().redis_url
    except Exception:
        return None


# Pre-configured limiters with Redis support
_redis_url = _get_redis_url()

# Chat: 15 requests per minute (Gemini API calls are expensive)
chat_limiter = RateLimiter(
    max_requests=15,
    window_seconds=60,
    prefix="rl:chat",
    redis_url=_redis_url,
)

# Summarize/Question: 10 requests per minute
document_ai_limiter = RateLimiter(
    max_requests=10,
    window_seconds=60,
    prefix="rl:docai",
    redis_url=_redis_url,
)
