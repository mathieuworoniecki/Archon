"""
War Room Backend - Archive Extraction Service
Supports recursive extraction of ZIP, RAR, and 7Z archives
"""
import os
import tempfile
import shutil
from pathlib import Path
from typing import List, Tuple, Optional, Set
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)

# Archive extensions we support
ARCHIVE_EXTENSIONS = {'.zip', '.rar', '.7z', '.tar', '.tar.gz', '.tgz', '.tar.bz2'}


@dataclass
class ExtractionResult:
    """Result of recursive archive extraction."""
    files: List[Tuple[Path, Optional[str]]] = field(default_factory=list)
    temp_dirs: List[Path] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)


class ArchiveExtractor:
    """
    Handles recursive extraction of archive files.
    
    Supports:
    - ZIP files (via zipfile)
    - RAR files (via rarfile - requires unrar binary)
    - 7Z files (via py7zr)
    - TAR/TGZ/TBZ2 files (via tarfile)
    """
    
    def __init__(self, max_depth: int = 5, max_size_mb: int = 500):
        """
        Initialize extractor.
        
        Args:
            max_depth: Maximum nesting depth for archives
            max_size_mb: Maximum total extraction size in MB
        """
        self.max_depth = max_depth
        self.max_size_mb = max_size_mb
        self._temp_dirs: List[Path] = []
    
    def is_archive(self, path: str | Path) -> bool:
        """Check if a file is a supported archive."""
        path = Path(path)
        suffix = path.suffix.lower()
        
        # Handle double extensions like .tar.gz
        if suffix in {'.gz', '.bz2'}:
            stem_suffix = Path(path.stem).suffix.lower()
            if stem_suffix == '.tar':
                return True
        
        return suffix in ARCHIVE_EXTENSIONS
    
    def _create_temp_dir(self) -> Path:
        """Create a temporary directory for extraction."""
        temp_dir = Path(tempfile.mkdtemp(prefix="archon_extract_"))
        self._temp_dirs.append(temp_dir)
        return temp_dir
    
    def _extract_zip(self, archive_path: Path, dest_dir: Path) -> bool:
        """Extract ZIP archive."""
        import zipfile
        try:
            with zipfile.ZipFile(archive_path, 'r') as zf:
                zf.extractall(dest_dir)
            return True
        except zipfile.BadZipFile as e:
            logger.warning(f"Bad ZIP file {archive_path}: {e}")
            return False
    
    def _extract_rar(self, archive_path: Path, dest_dir: Path) -> bool:
        """Extract RAR archive."""
        try:
            import rarfile
            with rarfile.RarFile(archive_path, 'r') as rf:
                rf.extractall(dest_dir)
            return True
        except ImportError:
            logger.warning("rarfile not installed, skipping RAR extraction")
            return False
        except Exception as e:
            logger.warning(f"Failed to extract RAR {archive_path}: {e}")
            return False
    
    def _extract_7z(self, archive_path: Path, dest_dir: Path) -> bool:
        """Extract 7Z archive."""
        try:
            import py7zr
            with py7zr.SevenZipFile(archive_path, 'r') as sz:
                sz.extractall(dest_dir)
            return True
        except ImportError:
            logger.warning("py7zr not installed, skipping 7Z extraction")
            return False
        except Exception as e:
            logger.warning(f"Failed to extract 7Z {archive_path}: {e}")
            return False
    
    def _extract_tar(self, archive_path: Path, dest_dir: Path) -> bool:
        """Extract TAR/TGZ/TBZ2 archive."""
        import tarfile
        try:
            with tarfile.open(archive_path, 'r:*') as tf:
                # Security: avoid path traversal
                for member in tf.getmembers():
                    if member.name.startswith('/') or '..' in member.name:
                        logger.warning(f"Skipping suspicious path in tar: {member.name}")
                        continue
                    tf.extract(member, dest_dir)
            return True
        except tarfile.TarError as e:
            logger.warning(f"Failed to extract TAR {archive_path}: {e}")
            return False
    
    def extract_archive(self, archive_path: Path, dest_dir: Path) -> bool:
        """
        Extract an archive to the destination directory.
        
        Returns True if successful, False otherwise.
        """
        suffix = archive_path.suffix.lower()
        
        # Handle .tar.gz, .tar.bz2
        if suffix in {'.gz', '.bz2'}:
            if Path(archive_path.stem).suffix.lower() == '.tar':
                return self._extract_tar(archive_path, dest_dir)
        
        extractors = {
            '.zip': self._extract_zip,
            '.rar': self._extract_rar,
            '.7z': self._extract_7z,
            '.tar': self._extract_tar,
            '.tgz': self._extract_tar,
        }
        
        extractor = extractors.get(suffix)
        if extractor:
            return extractor(archive_path, dest_dir)
        
        return False
    
    def extract_recursive(
        self,
        root_path: str | Path,
        current_depth: int = 0,
        archive_prefix: str = ""
    ) -> ExtractionResult:
        """
        Recursively extract archives and discover files.
        
        Args:
            root_path: Path to scan (file or directory)
            current_depth: Current recursion depth
            archive_prefix: Path prefix showing archive nesting
            
        Returns:
            ExtractionResult with all discovered files and their archive paths
        """
        result = ExtractionResult()
        root = Path(root_path)
        
        if not root.exists():
            result.errors.append(f"Path does not exist: {root_path}")
            return result
        
        if root.is_file():
            if self.is_archive(root) and current_depth < self.max_depth:
                # Extract archive and recurse
                temp_dir = self._create_temp_dir()
                result.temp_dirs.append(temp_dir)
                
                if self.extract_archive(root, temp_dir):
                    # Build new archive prefix
                    new_prefix = f"{archive_prefix}{root.name}/" if archive_prefix else f"{root.name}/"
                    
                    # Recurse into extracted contents
                    sub_result = self.extract_recursive(
                        temp_dir,
                        current_depth + 1,
                        new_prefix
                    )
                    result.files.extend(sub_result.files)
                    result.temp_dirs.extend(sub_result.temp_dirs)
                    result.errors.extend(sub_result.errors)
                else:
                    result.errors.append(f"Failed to extract: {root}")
            else:
                # Regular file - add to results
                result.files.append((root, archive_prefix if archive_prefix else None))
        else:
            # Directory - walk all files
            for item in root.iterdir():
                sub_result = self.extract_recursive(
                    item,
                    current_depth,
                    archive_prefix
                )
                result.files.extend(sub_result.files)
                result.temp_dirs.extend(sub_result.temp_dirs)
                result.errors.extend(sub_result.errors)
        
        return result
    
    def cleanup(self):
        """Remove all temporary directories created during extraction."""
        for temp_dir in self._temp_dirs:
            try:
                if temp_dir.exists():
                    shutil.rmtree(temp_dir)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp dir {temp_dir}: {e}")
        self._temp_dirs.clear()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cleanup()


def get_archive_extractor(max_depth: int = 5) -> ArchiveExtractor:
    """Get a new archive extractor instance."""
    return ArchiveExtractor(max_depth=max_depth)
