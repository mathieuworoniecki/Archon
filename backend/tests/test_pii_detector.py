"""
Tests for PII Detector Service.
"""
import pytest


class TestPIIDetection:
    """Test PII pattern detection."""

    def test_detect_ssn(self):
        from app.services.pii_detector import PIIDetector
        detector = PIIDetector()
        matches = detector.detect("SSN is 123-45-6789")
        ssn_matches = [m for m in matches if m.pii_type == "SSN"]
        assert len(ssn_matches) == 1
        assert ssn_matches[0].text == "123-45-6789"

    def test_reject_invalid_ssn(self):
        from app.services.pii_detector import PIIDetector
        detector = PIIDetector()
        # SSN starting with 000 is invalid
        matches = detector.detect("SSN is 000-12-3456")
        ssn_matches = [m for m in matches if m.pii_type == "SSN"]
        assert len(ssn_matches) == 0

    def test_detect_email(self):
        from app.services.pii_detector import PIIDetector
        detector = PIIDetector()
        matches = detector.detect("Contact alice@example.com for details")
        email_matches = [m for m in matches if m.pii_type == "EMAIL"]
        assert len(email_matches) == 1
        assert email_matches[0].text == "alice@example.com"

    def test_detect_credit_card(self):
        from app.services.pii_detector import PIIDetector
        detector = PIIDetector()
        # Valid Luhn number
        matches = detector.detect("Card: 4111-1111-1111-1111")
        cc_matches = [m for m in matches if m.pii_type == "CREDIT_CARD"]
        assert len(cc_matches) == 1

    def test_reject_invalid_credit_card(self):
        from app.services.pii_detector import PIIDetector
        detector = PIIDetector()
        # Invalid Luhn
        matches = detector.detect("Card: 1234-5678-9012-3456")
        cc_matches = [m for m in matches if m.pii_type == "CREDIT_CARD"]
        assert len(cc_matches) == 0

    def test_detect_french_phone(self):
        from app.services.pii_detector import PIIDetector
        detector = PIIDetector()
        matches = detector.detect("Appelez le 06 12 34 56 78")
        phone_matches = [m for m in matches if m.pii_type == "PHONE_FR"]
        assert len(phone_matches) == 1

    def test_no_false_positives_on_clean_text(self):
        from app.services.pii_detector import PIIDetector
        detector = PIIDetector()
        text = "The quick brown fox jumps over the lazy dog. Document ID: 42."
        matches = detector.detect(text)
        assert len(matches) == 0

    def test_multiple_pii_in_one_text(self):
        from app.services.pii_detector import PIIDetector
        detector = PIIDetector()
        text = "Contact alice@corp.com, SSN 123-45-6789, card 4111-1111-1111-1111"
        matches = detector.detect(text)
        types = {m.pii_type for m in matches}
        assert "EMAIL" in types
        assert "SSN" in types
        assert "CREDIT_CARD" in types


class TestPIIRedaction:
    """Test PII text redaction."""

    def test_redact_text(self):
        from app.services.pii_detector import PIIDetector
        detector = PIIDetector()
        text = "Email me at alice@example.com"
        redacted = detector.redact_text(text)
        assert "alice@example.com" not in redacted
        assert "[EMAIL" in redacted

    def test_redact_clean_text_unchanged(self):
        from app.services.pii_detector import PIIDetector
        detector = PIIDetector()
        text = "No PII here, just normal text."
        assert detector.redact_text(text) == text


class TestLuhnValidation:
    """Test Luhn algorithm validation."""

    def test_valid_visa(self):
        from app.services.pii_detector import PIIDetector
        assert PIIDetector._validate_luhn("4111111111111111") is True

    def test_valid_mastercard(self):
        from app.services.pii_detector import PIIDetector
        assert PIIDetector._validate_luhn("5500000000000004") is True

    def test_invalid_number(self):
        from app.services.pii_detector import PIIDetector
        assert PIIDetector._validate_luhn("1234567890123456") is False

    def test_too_short(self):
        from app.services.pii_detector import PIIDetector
        assert PIIDetector._validate_luhn("123") is False


class TestSSNValidation:
    """Test SSN validation."""

    def test_valid_ssn(self):
        from app.services.pii_detector import PIIDetector
        assert PIIDetector._validate_ssn("123-45-6789") is True

    def test_invalid_area_000(self):
        from app.services.pii_detector import PIIDetector
        assert PIIDetector._validate_ssn("000-12-3456") is False

    def test_invalid_area_666(self):
        from app.services.pii_detector import PIIDetector
        assert PIIDetector._validate_ssn("666-12-3456") is False

    def test_invalid_area_900(self):
        from app.services.pii_detector import PIIDetector
        assert PIIDetector._validate_ssn("900-12-3456") is False
