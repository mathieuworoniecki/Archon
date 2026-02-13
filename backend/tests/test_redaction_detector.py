"""
Tests for the Redaction Detection Service.
Verifies detection of explicit markers, classification patterns,
and obscured text in document content.
"""
import pytest
from app.services.redaction_detector import detect_redaction, RedactionResult


class TestDetectRedaction:
    """Core redaction detection tests."""
    
    def test_none_text_returns_clean(self):
        result = detect_redaction(None)
        assert not result.is_redacted
        assert result.marker_count == 0
        assert result.confidence == 0.0
    
    def test_empty_text_returns_clean(self):
        result = detect_redaction("")
        assert not result.is_redacted
        assert result.marker_count == 0
    
    def test_short_text_returns_clean(self):
        result = detect_redaction("hello")
        assert not result.is_redacted
    
    def test_clean_text_returns_clean(self):
        text = "This is a normal document with no hidden content whatsoever. It discusses various topics in detail."
        result = detect_redaction(text)
        assert not result.is_redacted
        assert result.marker_count == 0
        assert result.confidence == 0.0
        assert result.markers_found == []


class TestExplicitMarkers:
    """Test detection of explicit redaction markers."""
    
    def test_redacted_bracket(self):
        text = "The suspect met with [REDACTED] on January 5th at the [REDACTED] location."
        result = detect_redaction(text)
        assert result.is_redacted
        assert result.marker_count >= 2
        assert "explicit" in result.markers_found
        assert result.confidence >= 0.6
    
    def test_expurge_bracket(self):
        text = "Le document mentionne [EXPURGÉ] et d'autres détails importants."
        result = detect_redaction(text)
        assert result.is_redacted
        assert "explicit" in result.markers_found
    
    def test_xxxx_pattern(self):
        text = "The account number is XXXXXXXX and the name is XXXXX."
        result = detect_redaction(text)
        assert result.is_redacted
        assert "explicit" in result.markers_found
    
    def test_block_characters(self):
        text = "The name was █████████ and the address was ████████."
        result = detect_redaction(text)
        assert result.is_redacted
        assert "explicit" in result.markers_found
    
    def test_withheld_keyword(self):
        text = "This information has been WITHHELD pursuant to exemption 7(c)."
        result = detect_redaction(text)
        assert result.is_redacted
    
    def test_sealed_keyword(self):
        text = "Pages 42-56 are SEALED by court order."
        result = detect_redaction(text)
        assert result.is_redacted
    
    def test_classified_with_context(self):
        text = "This section is Classified by: NSA and cannot be disclosed."
        result = detect_redaction(text)
        assert result.is_redacted
        assert "classification" in result.markers_found
    
    def test_underscores(self):
        text = "The name of the individual is __________ and their role was __________."
        result = detect_redaction(text)
        assert result.is_redacted
        assert "explicit" in result.markers_found


class TestClassificationMarkers:
    """Test detection of government-style classification patterns."""
    
    def test_foia_exemption_b6(self):
        text = "Name redacted pursuant to b(6) of the Freedom of Information Act."
        result = detect_redaction(text)
        assert result.is_redacted
        assert "classification" in result.markers_found
    
    def test_foia_exemption_b7(self):
        text = "Details withheld under b(7)(c) exemption."
        result = detect_redaction(text)
        assert result.is_redacted
    
    def test_classified_by_pattern(self):
        text = "Classified by: Director, NSA. Declassified on: 2025-01-15."
        result = detect_redaction(text)
        assert result.is_redacted
        assert "classification" in result.markers_found
    
    def test_foia_keyword(self):
        text = "This document is FOIA EXEMPT and should not be released."
        result = detect_redaction(text)
        assert result.is_redacted


class TestObscuredPatterns:
    """Test detection of obscured text patterns."""
    
    def test_asterisks(self):
        text = "The name is ********** and they work at **********."
        result = detect_redaction(text)
        assert result.is_redacted
        assert "obscured" in result.markers_found
    
    def test_long_dashes(self):
        text = "Reference number: -------------------- (withheld)"
        result = detect_redaction(text)
        assert result.is_redacted
        assert "obscured" in result.markers_found
    
    def test_hashes(self):
        text = "The individual known as ####### was present at the meeting."
        result = detect_redaction(text)
        assert result.is_redacted


class TestConfidenceScoring:
    """Test confidence score calculation."""
    
    def test_high_confidence_explicit(self):
        """Multiple explicit markers should produce high confidence."""
        text = "[REDACTED] met with [REDACTED] regarding [REDACTED] at [REDACTED] on [REDACTED]."
        result = detect_redaction(text)
        assert result.is_redacted
        assert result.confidence >= 0.8
    
    def test_lower_confidence_obscured(self):
        """Obscured patterns alone should have lower confidence than explicit."""
        text = "Reference: ***** filed on date."
        result = detect_redaction(text)
        # Obscured alone starts at lower confidence
        if result.is_redacted:
            assert result.confidence <= 0.7
    
    def test_multiple_signal_types(self):
        """Multiple signal types should boost confidence."""
        text = "[REDACTED] information pursuant to b(6) exemption. Name: XXXXXXXX."
        result = detect_redaction(text)
        assert result.is_redacted
        assert len(result.markers_found) >= 2
        assert result.confidence >= 0.7


class TestRedactionResultStructure:
    """Test the RedactionResult dataclass structure."""
    
    def test_fields_present(self):
        result = detect_redaction("Clean document text without any markers at all.")
        assert hasattr(result, 'is_redacted')
        assert hasattr(result, 'marker_count')
        assert hasattr(result, 'markers_found')
        assert hasattr(result, 'confidence')
    
    def test_markers_found_is_sorted(self):
        text = "[REDACTED] b(6) **********"
        result = detect_redaction(text)
        assert result.markers_found == sorted(result.markers_found)
    
    def test_confidence_bounded(self):
        """Confidence should always be between 0 and 1."""
        # Create text with many markers to test upper bound
        text = " ".join(["[REDACTED]"] * 50)
        result = detect_redaction(text)
        assert 0.0 <= result.confidence <= 1.0


class TestEdgeCases:
    """Test edge cases and false positive avoidance."""
    
    def test_word_redacted_in_bracket_context(self):
        """[REDACTED] in bracket form should flag."""
        text = "The [REDACTED] portions of this document are classified."
        result = detect_redaction(text)
        assert result.is_redacted
    
    def test_code_with_underscores_not_triggered(self):
        """Short underscores (< 5) should not trigger."""
        text = "my_variable_name = some_function(arg1, arg2)"
        result = detect_redaction(text)
        assert not result.is_redacted
    
    def test_normal_dashes_not_triggered(self):
        """Short dashes (< 10) should not trigger obscured."""
        text = "Reference: ABC-DEF-123 filed on 2024-01-15"
        result = detect_redaction(text)
        # Should not trigger based on dashes alone
        assert result.marker_count == 0 or "obscured" not in result.markers_found
