"""
Tests for the rate limiter.
"""
import time
from unittest.mock import MagicMock
import pytest

from app.utils.rate_limiter import RateLimiter
from fastapi import HTTPException


def _make_request(ip: str = "127.0.0.1") -> MagicMock:
    """Create a mock FastAPI Request with given IP."""
    req = MagicMock()
    req.headers = {}
    req.client = MagicMock()
    req.client.host = ip
    return req


class TestRateLimiter:
    """Tests for the sliding window rate limiter."""

    def test_allows_within_limit(self):
        limiter = RateLimiter(max_requests=5, window_seconds=60)
        req = _make_request()

        # Should not raise for 5 requests
        for _ in range(5):
            limiter.check(req)

    def test_blocks_over_limit(self):
        limiter = RateLimiter(max_requests=3, window_seconds=60)
        req = _make_request()

        for _ in range(3):
            limiter.check(req)

        with pytest.raises(HTTPException) as exc_info:
            limiter.check(req)
        assert exc_info.value.status_code == 429
        assert "Retry-After" in exc_info.value.headers

    def test_different_clients_independent(self):
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        req_a = _make_request("10.0.0.1")
        req_b = _make_request("10.0.0.2")

        # Each client gets their own quota
        limiter.check(req_a)
        limiter.check(req_a)
        limiter.check(req_b)
        limiter.check(req_b)

        # Client A is blocked, B is still fine after only 2
        with pytest.raises(HTTPException):
            limiter.check(req_a)

    def test_window_expiration(self):
        limiter = RateLimiter(max_requests=2, window_seconds=1)
        req = _make_request()

        limiter.check(req)
        limiter.check(req)

        # Wait for window to expire
        time.sleep(1.1)

        # Should be allowed again
        limiter.check(req)

    def test_forwarded_for_header(self):
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        req = _make_request()
        req.headers = {"x-forwarded-for": "192.168.1.100, 10.0.0.1"}

        limiter.check(req)

        # Verify the key is from the forwarded header
        remaining = limiter.get_remaining(req)
        assert remaining["remaining"] == 1

    def test_get_remaining(self):
        limiter = RateLimiter(max_requests=5, window_seconds=60)
        req = _make_request()

        status = limiter.get_remaining(req)
        assert status["limit"] == 5
        assert status["remaining"] == 5

        limiter.check(req)
        limiter.check(req)

        status = limiter.get_remaining(req)
        assert status["remaining"] == 3

    def test_cleanup_removes_old_entries(self):
        limiter = RateLimiter(max_requests=10, window_seconds=1)
        req = _make_request()

        # Fill with requests
        for _ in range(5):
            limiter.check(req)

        assert len(limiter._memory) == 1

        # Wait for expiration
        time.sleep(1.1)

        # Trigger cleanup
        limiter.get_remaining(req)

        # Key should be cleaned up
        assert len(limiter._memory) == 0
