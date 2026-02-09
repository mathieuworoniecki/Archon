"""
Hash utility functions for chain of proof and fast dedup.

Strategy:
  - xxhash (XXH3_64): Ultra-fast dedup check (~10GB/s vs ~500MB/s for SHA256)
  - SHA256 + MD5: Chain of proof, computed only for NEW files (post-dedup)
"""
import hashlib
from pathlib import Path
from typing import Tuple, Optional

try:
    import xxhash
    HAS_XXHASH = True
except ImportError:
    HAS_XXHASH = False


def compute_fast_hash(file_path: str, chunk_size: int = 65536) -> str:
    """
    Compute a fast hash for dedup purposes (xxhash XXH3_64).
    Falls back to MD5 if xxhash is not installed.
    
    Uses 64KB chunks for maximum throughput on large files.
    
    Returns:
        Hash as hex string, or empty string on error
    """
    path = Path(file_path)
    if not path.exists():
        return ""
    
    try:
        if HAS_XXHASH:
            h = xxhash.xxh3_64()
        else:
            h = hashlib.md5()
        
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(chunk_size), b""):
                h.update(chunk)
        
        return h.hexdigest()
    except Exception:
        return ""


def compute_file_hashes(file_path: str, chunk_size: int = 65536) -> Tuple[str, str]:
    """
    Compute MD5 and SHA256 hashes for chain of proof.
    Called only on NEW files (after dedup with fast hash).
    
    Uses 64KB chunks for better throughput than 8KB default.
    
    Returns:
        Tuple of (md5_hash, sha256_hash) as hex strings
    """
    md5_hash = hashlib.md5()
    sha256_hash = hashlib.sha256()
    
    path = Path(file_path)
    if not path.exists():
        return ("", "")
    
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(chunk_size), b""):
                md5_hash.update(chunk)
                sha256_hash.update(chunk)
        
        return (md5_hash.hexdigest(), sha256_hash.hexdigest())
    except Exception:
        return ("", "")


def compute_content_hashes(content: bytes) -> Tuple[str, str]:
    """Compute MD5 and SHA256 hashes for bytes content."""
    return (
        hashlib.md5(content).hexdigest(),
        hashlib.sha256(content).hexdigest()
    )


def verify_file_hash(file_path: str, expected_sha256: str) -> bool:
    """Verify that a file matches its expected SHA256 hash."""
    _, sha256 = compute_file_hashes(file_path)
    return sha256.lower() == expected_sha256.lower()
