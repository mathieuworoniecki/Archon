"""
Request-scoped correlation context helpers.
"""
from __future__ import annotations

from contextvars import ContextVar, Token


_REQUEST_ID_CTX: ContextVar[str | None] = ContextVar("archon_request_id", default=None)


def set_request_id(request_id: str) -> Token:
    """Bind a request_id to the current execution context."""
    return _REQUEST_ID_CTX.set(request_id)


def reset_request_id(token: Token) -> None:
    """Restore the previous request_id context."""
    _REQUEST_ID_CTX.reset(token)


def get_request_id(default: str = "unknown") -> str:
    """Read the current request_id from context."""
    return _REQUEST_ID_CTX.get() or default

