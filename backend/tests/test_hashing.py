"""
Tests for hashing utilities (chain of proof).
"""
import hashlib

from app.utils.hashing import compute_file_hashes, compute_content_hashes, verify_file_hash


class TestComputeFileHashes:
    """Tests for compute_file_hashes()."""

    def test_basic_hash(self, tmp_path):
        """Verify correct MD5 and SHA256 for a known file."""
        test_file = tmp_path / "test.txt"
        content = b"Hello, World!"
        test_file.write_bytes(content)

        md5, sha256 = compute_file_hashes(str(test_file))

        assert md5 == hashlib.md5(content).hexdigest()
        assert sha256 == hashlib.sha256(content).hexdigest()

    def test_empty_file(self, tmp_path):
        """Hashing an empty file should still work."""
        test_file = tmp_path / "empty.txt"
        test_file.write_bytes(b"")

        md5, sha256 = compute_file_hashes(str(test_file))

        assert md5 == hashlib.md5(b"").hexdigest()
        assert sha256 == hashlib.sha256(b"").hexdigest()

    def test_non_existent_file(self):
        """Non-existent file should return empty strings."""
        md5, sha256 = compute_file_hashes("/non/existent/path.txt")
        assert md5 == ""
        assert sha256 == ""

    def test_deterministic(self, tmp_path):
        """Same file should give same hashes."""
        test_file = tmp_path / "stable.dat"
        test_file.write_bytes(b"deterministic content")

        h1 = compute_file_hashes(str(test_file))
        h2 = compute_file_hashes(str(test_file))

        assert h1 == h2

    def test_large_file(self, tmp_path):
        """Verify chunked hashing works on a file larger than chunk_size."""
        test_file = tmp_path / "large.bin"
        content = b"A" * 100_000  # 100KB
        test_file.write_bytes(content)

        md5, sha256 = compute_file_hashes(str(test_file), chunk_size=1024)

        assert md5 == hashlib.md5(content).hexdigest()
        assert sha256 == hashlib.sha256(content).hexdigest()


class TestComputeContentHashes:
    """Tests for compute_content_hashes()."""

    def test_basic(self):
        content = b"test content"
        md5, sha256 = compute_content_hashes(content)
        assert md5 == hashlib.md5(content).hexdigest()
        assert sha256 == hashlib.sha256(content).hexdigest()

    def test_empty_content(self):
        md5, sha256 = compute_content_hashes(b"")
        assert md5 == hashlib.md5(b"").hexdigest()
        assert sha256 == hashlib.sha256(b"").hexdigest()


class TestVerifyFileHash:
    """Tests for verify_file_hash()."""

    def test_matching_hash(self, tmp_path):
        test_file = tmp_path / "verify.txt"
        content = b"verify me"
        test_file.write_bytes(content)
        expected_sha256 = hashlib.sha256(content).hexdigest()

        assert verify_file_hash(str(test_file), expected_sha256) is True

    def test_mismatched_hash(self, tmp_path):
        test_file = tmp_path / "verify.txt"
        test_file.write_bytes(b"original")

        assert verify_file_hash(str(test_file), "0" * 64) is False

    def test_case_insensitive(self, tmp_path):
        test_file = tmp_path / "case.txt"
        content = b"case test"
        test_file.write_bytes(content)
        expected = hashlib.sha256(content).hexdigest().upper()

        assert verify_file_hash(str(test_file), expected) is True
