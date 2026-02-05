"""
Hash utility functions for chain of proof.
"""
import hashlib
from pathlib import Path
from typing import Tuple, Optional


def compute_file_hashes(file_path: str, chunk_size: int = 8192) -> Tuple[str, str]:
    """
    Compute MD5 and SHA256 hashes for a file.
    
    Args:
        file_path: Path to the file
        chunk_size: Size of chunks to read (for memory efficiency)
    
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
    """
    Compute MD5 and SHA256 hashes for bytes content.
    
    Args:
        content: Bytes content to hash
    
    Returns:
        Tuple of (md5_hash, sha256_hash) as hex strings
    """
    return (
        hashlib.md5(content).hexdigest(),
        hashlib.sha256(content).hexdigest()
    )


def verify_file_hash(file_path: str, expected_sha256: str) -> bool:
    """
    Verify that a file matches its expected SHA256 hash.
    
    Args:
        file_path: Path to the file
        expected_sha256: Expected SHA256 hash
    
    Returns:
        True if hash matches, False otherwise
    """
    _, sha256 = compute_file_hashes(file_path)
    return sha256.lower() == expected_sha256.lower()
