"""
Path safety helpers for scan-related operations.
"""
from __future__ import annotations

import os
from pathlib import Path

from ..config import get_settings


def get_scan_root() -> Path:
    """
    Return the canonical allowed root for scans.

    Priority:
    1. `DOCUMENTS_PATH` env var (already used by projects API)
    2. `documents_path` setting (from `.env`, same semantic as DOCUMENTS_PATH)
    3. `scan_root_path` setting (legacy fallback)
    """
    settings = get_settings()
    root_raw = os.environ.get("DOCUMENTS_PATH") or settings.documents_path or settings.scan_root_path
    return Path(root_raw).expanduser().resolve()


def normalize_scan_path(raw_path: str) -> Path:
    """
    Resolve and validate a scan path.

    Rules:
    - path must exist
    - path must be a directory
    - path must be under the configured scan root
    """
    target = Path(raw_path).expanduser()
    resolved = target.resolve(strict=True)

    if not resolved.is_dir():
        raise NotADirectoryError(f"Path must be a directory: {raw_path}")

    root = get_scan_root()
    if not root.exists():
        raise FileNotFoundError(f"Scan root does not exist: {root}")

    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise PermissionError(
            f"Path is outside allowed scan root: {root}"
        ) from exc

    return resolved
