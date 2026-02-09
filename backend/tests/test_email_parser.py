"""
Tests for Email Parser Service.
"""
import pytest
import tempfile
import os
from pathlib import Path


class TestEmailParserInit:
    """Test EmailParserService initialization."""

    def test_import_and_create(self):
        from app.services.email_parser import EmailParserService
        service = EmailParserService()
        assert service is not None

    def test_extension_detection(self):
        from app.services.email_parser import EmailParserService
        service = EmailParserService()
        assert service.is_email_file("test.eml")
        assert service.is_email_file("test.pst")
        assert service.is_email_file("test.mbox")
        assert not service.is_email_file("test.pdf")
        assert not service.is_email_file("test.txt")

    def test_email_type_detection(self):
        from app.services.email_parser import EmailParserService
        service = EmailParserService()
        assert service.get_email_type("test.eml") == "eml"
        assert service.get_email_type("test.msg") == "eml"
        assert service.get_email_type("test.mbox") == "mbox"
        assert service.get_email_type("test.pst") == "pst"
        assert service.get_email_type("test.pdf") == "unknown"


class TestEMLParsing:
    """Test EML file parsing."""

    def test_parse_simple_eml(self, tmp_path):
        from app.services.email_parser import EmailParserService
        service = EmailParserService()
        
        # Create a minimal EML file
        eml_content = (
            "From: sender@example.com\r\n"
            "To: recipient@example.com\r\n"
            "Subject: Test Email\r\n"
            "Date: Mon, 1 Jan 2026 12:00:00 +0000\r\n"
            "Message-ID: <test123@example.com>\r\n"
            "\r\n"
            "This is the body of the test email.\r\n"
        )
        
        eml_file = tmp_path / "test.eml"
        eml_file.write_text(eml_content)
        
        result = service.parse_eml(str(eml_file))
        
        assert "sender@example.com" in result.from_addr
        assert "recipient@example.com" in result.to_addr
        assert "Test Email" in result.subject
        assert "test123@example.com" in result.message_id
        assert "body of the test email" in result.body_text

    def test_parse_eml_not_found(self):
        from app.services.email_parser import EmailParserService
        service = EmailParserService()
        
        with pytest.raises(FileNotFoundError):
            service.parse_eml("/nonexistent/file.eml")

    def test_searchable_text_output(self, tmp_path):
        from app.services.email_parser import EmailParserService
        service = EmailParserService()
        
        eml_content = (
            "From: alice@corp.com\r\n"
            "To: bob@corp.com\r\n"
            "Subject: Meeting Notes\r\n"
            "\r\n"
            "Please review the attached document.\r\n"
        )
        
        eml_file = tmp_path / "meeting.eml"
        eml_file.write_text(eml_content)
        
        result = service.parse_eml(str(eml_file))
        text = result.to_searchable_text()
        
        assert "From: alice@corp.com" in text
        assert "Subject: Meeting Notes" in text
        assert "Please review" in text

    def test_extract_text_method(self, tmp_path):
        from app.services.email_parser import EmailParserService
        service = EmailParserService()
        
        eml_content = (
            "From: test@example.com\r\n"
            "Subject: Quick Test\r\n"
            "\r\n"
            "Hello world.\r\n"
        )
        
        eml_file = tmp_path / "quick.eml"
        eml_file.write_text(eml_content)
        
        text, is_email = service.extract_text(str(eml_file))
        assert is_email is True
        assert "Hello world" in text
