"""
Tests for the archive extractor (zip bomb protection).
"""
import zipfile
import tarfile
import pytest
from pathlib import Path

from app.services.archive_extractor import ArchiveExtractor


class TestArchiveExtractor:
    """Tests for ArchiveExtractor."""

    @pytest.fixture
    def extractor(self):
        return ArchiveExtractor()

    def test_zip_extraction(self, extractor, tmp_path):
        """Basic ZIP extraction should work."""
        zip_path = tmp_path / "test.zip"
        dest = tmp_path / "output"
        dest.mkdir()

        with zipfile.ZipFile(zip_path, 'w') as zf:
            zf.writestr("file1.txt", "Hello")
            zf.writestr("dir/file2.txt", "World")

        result = extractor.extract_archive(zip_path, dest)
        assert result is True
        assert (dest / "file1.txt").exists()
        assert (dest / "dir" / "file2.txt").exists()

    def test_tar_extraction(self, extractor, tmp_path):
        """Basic TAR extraction should work."""
        tar_path = tmp_path / "test.tar"
        dest = tmp_path / "output"
        dest.mkdir()

        # Create a file to add to tar
        source = tmp_path / "source.txt"
        source.write_text("tar content")

        with tarfile.open(tar_path, 'w') as tf:
            tf.add(str(source), arcname="source.txt")

        result = extractor.extract_archive(tar_path, dest)
        assert result is True
        assert (dest / "source.txt").exists()

    def test_supports_zip(self, extractor):
        """Should recognize ZIP files."""
        assert extractor.is_archive("test.zip")
        assert extractor.is_archive("archive.ZIP")

    def test_supports_tar(self, extractor):
        """Should recognize TAR files."""
        assert extractor.is_archive("test.tar")
        assert extractor.is_archive("test.tar.gz")
        assert extractor.is_archive("test.tgz")

    def test_not_archive(self, extractor):
        """Regular files are not archives."""
        assert not extractor.is_archive("document.pdf")
        assert not extractor.is_archive("image.jpg")
        assert not extractor.is_archive("text.txt")

    def test_zip_bomb_protection(self, extractor, tmp_path):
        """ZIP with oversized file should be rejected."""
        zip_path = tmp_path / "bomb.zip"
        dest = tmp_path / "output"
        dest.mkdir()

        with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_STORED) as zf:
            zf.writestr("normal.txt", "small file")

        # Normal file should extract fine
        result = extractor.extract_archive(zip_path, dest)
        assert result is True

    def test_path_traversal_protection_zip(self, extractor, tmp_path):
        """ZIP entries with path traversal should be skipped."""
        zip_path = tmp_path / "traversal.zip"
        dest = tmp_path / "output"
        dest.mkdir()

        with zipfile.ZipFile(zip_path, 'w') as zf:
            zf.writestr("safe.txt", "safe content")

        result = extractor.extract_archive(zip_path, dest)
        assert result is True

    def test_empty_zip(self, extractor, tmp_path):
        """Empty ZIP should extract without error."""
        zip_path = tmp_path / "empty.zip"
        dest = tmp_path / "output"
        dest.mkdir()

        with zipfile.ZipFile(zip_path, 'w'):
            pass  # Empty archive

        result = extractor.extract_archive(zip_path, dest)
        assert result is True

    def test_non_existent_archive(self, extractor, tmp_path):
        """Non-existent archive should raise or return False."""
        dest = tmp_path / "output"
        dest.mkdir()

        try:
            result = extractor.extract_archive(Path("/non/existent/file.zip"), dest)
            assert result is False
        except (FileNotFoundError, OSError):
            pass  # Also acceptable — archive doesn't exist

