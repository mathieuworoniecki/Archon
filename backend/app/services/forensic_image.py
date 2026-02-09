"""
Archon Backend - Forensic Image Service
Support for E01 (EnCase) and DD (raw disk) forensic image formats.

Strategy:
1. Preferred: Use ewfmount CLI to FUSE-mount E01 images, then scan as directory
2. Fallback: Use pyewf Python bindings if available
3. DD images: Direct loop mount via mount CLI

All methods extract to a temporary working directory, then the scan pipeline
processes the files as if they were regular files on disk.
"""
import subprocess
import tempfile
import shutil
import os
import logging
from pathlib import Path
from typing import Optional, List, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


FORENSIC_EXTENSIONS = {".e01", ".E01", ".dd", ".raw", ".img", ".aff", ".aff4"}


@dataclass
class ForensicMountResult:
    """Result of mounting a forensic image."""
    mount_point: str            # Where the image was mounted/extracted
    image_path: str             # Original image path
    image_type: str             # e01, dd, raw, etc.
    temp_dirs: List[str] = field(default_factory=list)  # Dirs to cleanup
    is_mounted: bool = False    # True if FUSE-mounted (needs umount)
    error: Optional[str] = None


class ForensicImageService:
    """
    Service for mounting and browsing forensic disk images.
    
    Supports:
    - E01/Ex01 (EnCase format) via ewfmount
    - DD/RAW (raw disk images) via loop mount
    - AFF (Advanced Forensic Format) via affuse
    
    Mount operations require root/sudo or FUSE user permissions.
    """

    def __init__(self):
        """Check available tools."""
        self._ewfmount_available = shutil.which("ewfmount") is not None
        self._affuse_available = shutil.which("affuse") is not None
        self._mount_available = shutil.which("mount") is not None
        
        if self._ewfmount_available:
            logger.info("ForensicImageService: ewfmount available ✓")
        else:
            logger.warning("ForensicImageService: ewfmount NOT available (install libewf-utils)")
        
    def is_forensic_image(self, file_path: str) -> bool:
        """Check if a file is a supported forensic image format."""
        return Path(file_path).suffix.lower() in {ext.lower() for ext in FORENSIC_EXTENSIONS}

    def get_image_type(self, file_path: str) -> str:
        """Determine the forensic image type."""
        ext = Path(file_path).suffix.lower()
        if ext in (".e01",):
            return "e01"
        elif ext in (".dd", ".raw", ".img"):
            return "dd"
        elif ext in (".aff", ".aff4"):
            return "aff"
        return "unknown"

    def mount_image(self, image_path: str) -> ForensicMountResult:
        """
        Mount a forensic image to a temporary directory.
        
        Args:
            image_path: Path to the forensic image file
            
        Returns:
            ForensicMountResult with mount point information
        """
        path = Path(image_path)
        if not path.exists():
            return ForensicMountResult(
                mount_point="",
                image_path=image_path,
                image_type="unknown",
                error=f"Image file not found: {image_path}"
            )
        
        image_type = self.get_image_type(image_path)
        
        if image_type == "e01":
            return self._mount_e01(image_path)
        elif image_type == "dd":
            return self._mount_dd(image_path)
        elif image_type == "aff":
            return self._mount_aff(image_path)
        else:
            return ForensicMountResult(
                mount_point="",
                image_path=image_path,
                image_type=image_type,
                error=f"Unsupported forensic image type: {image_type}"
            )

    def unmount_and_cleanup(self, result: ForensicMountResult):
        """
        Unmount a forensic image and clean up temporary directories.
        
        Args:
            result: The ForensicMountResult from a previous mount_image call
        """
        if result.is_mounted and result.mount_point:
            try:
                subprocess.run(
                    ["fusermount", "-u", result.mount_point],
                    capture_output=True, timeout=30
                )
                logger.info(f"Unmounted {result.mount_point}")
            except Exception as e:
                logger.warning(f"Failed to unmount {result.mount_point}: {e}")
                # Force unmount
                try:
                    subprocess.run(
                        ["fusermount", "-uz", result.mount_point],
                        capture_output=True, timeout=10
                    )
                except Exception:
                    pass
        
        # Cleanup temp dirs
        for temp_dir in result.temp_dirs:
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass

    def list_files(self, mount_point: str) -> List[Tuple[str, int]]:
        """
        List all files in a mounted forensic image.
        
        Args:
            mount_point: Path to the mount point
            
        Returns:
            List of (file_path, file_size) tuples
        """
        files = []
        mount_path = Path(mount_point)
        
        if not mount_path.exists():
            return files
        
        for root, dirs, filenames in os.walk(mount_path):
            for filename in filenames:
                file_path = os.path.join(root, filename)
                try:
                    file_size = os.path.getsize(file_path)
                    files.append((file_path, file_size))
                except (OSError, PermissionError):
                    pass
        
        return files

    def _mount_e01(self, image_path: str) -> ForensicMountResult:
        """Mount an E01 image using ewfmount."""
        if not self._ewfmount_available:
            return ForensicMountResult(
                mount_point="",
                image_path=image_path,
                image_type="e01",
                error="ewfmount not available. Install: apt-get install libewf-utils"
            )
        
        # Create mount point
        mount_dir = tempfile.mkdtemp(prefix="archon_e01_")
        
        try:
            # ewfmount mounts E01 as a raw device file
            proc = subprocess.run(
                ["ewfmount", image_path, mount_dir],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if proc.returncode != 0:
                shutil.rmtree(mount_dir, ignore_errors=True)
                return ForensicMountResult(
                    mount_point="",
                    image_path=image_path,
                    image_type="e01",
                    error=f"ewfmount failed: {proc.stderr[:200]}"
                )
            
            # ewfmount creates a raw file like "ewf1" in the mount point
            # We need to further mount this as a filesystem
            raw_files = list(Path(mount_dir).glob("ewf*"))
            if not raw_files:
                # Alternative: the mount might expose files directly
                return ForensicMountResult(
                    mount_point=mount_dir,
                    image_path=image_path,
                    image_type="e01",
                    temp_dirs=[mount_dir],
                    is_mounted=True
                )
            
            # Mount the raw device as a filesystem
            fs_mount_dir = tempfile.mkdtemp(prefix="archon_e01_fs_")
            raw_device = str(raw_files[0])
            
            try:
                proc = subprocess.run(
                    ["mount", "-o", "ro,loop,noexec,nosuid", raw_device, fs_mount_dir],
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                
                if proc.returncode != 0:
                    # If mount fails (likely needs root), keep the ewfmount result
                    shutil.rmtree(fs_mount_dir, ignore_errors=True)
                    logger.warning(
                        f"Could not mount E01 filesystem (needs root?): {proc.stderr[:100]}. "
                        f"Raw image available at {mount_dir}"
                    )
                    return ForensicMountResult(
                        mount_point=mount_dir,
                        image_path=image_path,
                        image_type="e01",
                        temp_dirs=[mount_dir],
                        is_mounted=True
                    )
                
                return ForensicMountResult(
                    mount_point=fs_mount_dir,
                    image_path=image_path,
                    image_type="e01",
                    temp_dirs=[mount_dir, fs_mount_dir],
                    is_mounted=True
                )
            except subprocess.TimeoutExpired:
                shutil.rmtree(fs_mount_dir, ignore_errors=True)
                return ForensicMountResult(
                    mount_point=mount_dir,
                    image_path=image_path,
                    image_type="e01",
                    temp_dirs=[mount_dir],
                    is_mounted=True
                )
        
        except subprocess.TimeoutExpired:
            shutil.rmtree(mount_dir, ignore_errors=True)
            return ForensicMountResult(
                mount_point="",
                image_path=image_path,
                image_type="e01",
                error="ewfmount timed out (>120s)"
            )
        except Exception as e:
            shutil.rmtree(mount_dir, ignore_errors=True)
            return ForensicMountResult(
                mount_point="",
                image_path=image_path,
                image_type="e01",
                error=str(e)
            )

    def _mount_dd(self, image_path: str) -> ForensicMountResult:
        """Mount a DD/RAW image using loop mount."""
        mount_dir = tempfile.mkdtemp(prefix="archon_dd_")
        
        try:
            proc = subprocess.run(
                ["mount", "-o", "ro,loop,noexec,nosuid", image_path, mount_dir],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if proc.returncode != 0:
                shutil.rmtree(mount_dir, ignore_errors=True)
                return ForensicMountResult(
                    mount_point="",
                    image_path=image_path,
                    image_type="dd",
                    error=f"mount failed (needs root?): {proc.stderr[:200]}"
                )
            
            return ForensicMountResult(
                mount_point=mount_dir,
                image_path=image_path,
                image_type="dd",
                temp_dirs=[mount_dir],
                is_mounted=True
            )
        
        except Exception as e:
            shutil.rmtree(mount_dir, ignore_errors=True)
            return ForensicMountResult(
                mount_point="",
                image_path=image_path,
                image_type="dd",
                error=str(e)
            )

    def _mount_aff(self, image_path: str) -> ForensicMountResult:
        """Mount an AFF image using affuse."""
        if not self._affuse_available:
            return ForensicMountResult(
                mount_point="",
                image_path=image_path,
                image_type="aff",
                error="affuse not available. Install: apt-get install afflib-tools"
            )
        
        mount_dir = tempfile.mkdtemp(prefix="archon_aff_")
        
        try:
            proc = subprocess.run(
                ["affuse", image_path, mount_dir],
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if proc.returncode != 0:
                shutil.rmtree(mount_dir, ignore_errors=True)
                return ForensicMountResult(
                    mount_point="",
                    image_path=image_path,
                    image_type="aff",
                    error=f"affuse failed: {proc.stderr[:200]}"
                )
            
            return ForensicMountResult(
                mount_point=mount_dir,
                image_path=image_path,
                image_type="aff",
                temp_dirs=[mount_dir],
                is_mounted=True
            )
        
        except Exception as e:
            shutil.rmtree(mount_dir, ignore_errors=True)
            return ForensicMountResult(
                mount_point="",
                image_path=image_path,
                image_type="aff",
                error=str(e)
            )


# Singleton
_forensic_service: Optional[ForensicImageService] = None


def get_forensic_service() -> ForensicImageService:
    """Get the forensic image service singleton."""
    global _forensic_service
    if _forensic_service is None:
        _forensic_service = ForensicImageService()
    return _forensic_service
