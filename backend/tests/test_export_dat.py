"""
Tests for Concordance DAT/OPT export functionality.
"""
import pytest
from unittest.mock import MagicMock
from datetime import datetime, timezone


def make_mock_document(
    doc_id=1, file_name="test.pdf", file_path="/docs/test.pdf",
    file_type_value="pdf", file_size=1024, hash_md5="abc123",
    hash_sha256="def456", scan_id=1, archive_path=None,
    file_modified_at=None, indexed_at=None, text_content=""
):
    """Create a mock Document object."""
    doc = MagicMock()
    doc.id = doc_id
    doc.file_name = file_name
    doc.file_path = file_path
    doc.file_type = MagicMock()
    doc.file_type.value = file_type_value
    doc.file_size = file_size
    doc.hash_md5 = hash_md5
    doc.hash_sha256 = hash_sha256
    doc.scan_id = scan_id
    doc.archive_path = archive_path
    doc.file_modified_at = file_modified_at
    doc.indexed_at = indexed_at or datetime(2026, 1, 1, tzinfo=timezone.utc)
    doc.text_content = text_content
    return doc


class TestConcordanceDelimiters:
    """Test Concordance DAT format encoding."""

    def test_concordance_encode_basic(self):
        from app.api.export import _concordance_encode, CONCORDANCE_QUOTE
        result = _concordance_encode("hello")
        assert result == f"{CONCORDANCE_QUOTE}hello{CONCORDANCE_QUOTE}"

    def test_concordance_encode_none(self):
        from app.api.export import _concordance_encode, CONCORDANCE_QUOTE
        result = _concordance_encode(None)
        assert result == f"{CONCORDANCE_QUOTE}{CONCORDANCE_QUOTE}"

    def test_concordance_encode_newlines(self):
        from app.api.export import _concordance_encode, CONCORDANCE_NEWLINE
        result = _concordance_encode("line1\nline2")
        assert CONCORDANCE_NEWLINE in result
        assert "\n" not in result

    def test_concordance_encode_crlf(self):
        from app.api.export import _concordance_encode, CONCORDANCE_NEWLINE
        result = _concordance_encode("line1\r\nline2")
        assert CONCORDANCE_NEWLINE in result
        assert "\r\n" not in result


class TestBatesNumbering:
    """Test Bates number generation."""

    def test_default_padding(self):
        from app.api.export import _make_bates
        assert _make_bates("ARCHON", 1) == "ARCHON0000001"
        assert _make_bates("ARCHON", 42) == "ARCHON0000042"

    def test_custom_prefix(self):
        from app.api.export import _make_bates
        assert _make_bates("DOC", 100, padding=5) == "DOC00100"

    def test_large_number(self):
        from app.api.export import _make_bates
        assert _make_bates("X", 9999999) == "X9999999"


class TestDATFields:
    """Test DAT field definitions."""

    def test_required_fields_present(self):
        from app.api.export import DAT_FIELDS
        required = ["DOCID", "BEGDOC", "ENDDOC", "BATES_BEGIN", "BATES_END",
                     "FILE_NAME", "FILE_PATH", "MD5_HASH", "SHA256_HASH"]
        for f in required:
            assert f in DAT_FIELDS, f"Missing required field: {f}"

    def test_field_count(self):
        from app.api.export import DAT_FIELDS
        assert len(DAT_FIELDS) == 18
