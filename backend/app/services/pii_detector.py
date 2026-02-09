"""
Archon Backend - PII Detection Service
Regex-based PII detection for automated redaction.
No external dependencies (no Presidio) — pure regex patterns.
"""
import re
import logging
from typing import List
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class PIIMatch:
    """A detected PII occurrence."""
    pii_type: str          # e.g. "SSN", "CREDIT_CARD", "EMAIL", "PHONE"
    text: str              # The matched text
    start: int             # Start offset in source text
    end: int               # End offset in source text
    confidence: float      # 0.0–1.0 confidence score


# =============================================================================
# PII Pattern Definitions
# =============================================================================

_PATTERNS = {
    "SSN": {
        "pattern": r'\b(\d{3}[-\s]?\d{2}[-\s]?\d{4})\b',
        "confidence": 0.85,
        "validator": "_validate_ssn",
    },
    "CREDIT_CARD": {
        "pattern": r'\b(\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4})\b',
        "confidence": 0.80,
        "validator": "_validate_luhn",
    },
    "EMAIL": {
        "pattern": r'\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b',
        "confidence": 0.95,
        "validator": None,
    },
    "PHONE_US": {
        "pattern": r'\b(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b',
        "confidence": 0.70,
        "validator": None,
    },
    "PHONE_FR": {
        "pattern": r'\b(\+?33[-.\s]?\d[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2}|0\d[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2}[-.\s]?\d{2})\b',
        "confidence": 0.75,
        "validator": None,
    },
    "IBAN": {
        "pattern": r'\b([A-Z]{2}\d{2}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{4}[\s]?[\dA-Z]{0,4}[\s]?[\dA-Z]{0,4}[\s]?[\dA-Z]{0,4})\b',
        "confidence": 0.85,
        "validator": None,
    },
    "DATE_OF_BIRTH": {
        "pattern": r'\b((?:DOB|Date of Birth|Né\(e\) le|Date de naissance)\s*[:=]?\s*\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b',
        "confidence": 0.80,
        "validator": None,
    },
    "PASSPORT": {
        "pattern": r'\b(\d{2}[A-Z]{2}\d{5})\b',
        "confidence": 0.60,
        "validator": None,
    },
}


class PIIDetector:
    """
    Lightweight PII detection using compiled regex patterns.
    
    Supports: SSN, Credit Cards (Luhn-validated), Email addresses,
    US/FR phone numbers, IBAN, dates of birth, passport numbers.
    """
    
    def __init__(self, enabled_types: List[str] = None):
        """
        Initialize with optional type filter.
        
        Args:
            enabled_types: List of PII types to detect. None = all types.
        """
        self._compiled = {}
        for pii_type, config in _PATTERNS.items():
            if enabled_types is None or pii_type in enabled_types:
                self._compiled[pii_type] = {
                    "regex": re.compile(config["pattern"], re.IGNORECASE),
                    "confidence": config["confidence"],
                    "validator": config.get("validator"),
                }
    
    def detect(self, text: str) -> List[PIIMatch]:
        """
        Detect all PII occurrences in the given text.
        
        Args:
            text: Text to scan for PII
            
        Returns:
            List of PIIMatch objects, sorted by position
        """
        matches = []
        
        for pii_type, config in self._compiled.items():
            for m in config["regex"].finditer(text):
                matched_text = m.group(1) if m.lastindex else m.group(0)
                confidence = config["confidence"]
                
                # Apply validator if available
                validator_name = config["validator"]
                if validator_name:
                    validator = getattr(self, validator_name, None)
                    if validator and not validator(matched_text):
                        continue
                
                matches.append(PIIMatch(
                    pii_type=pii_type,
                    text=matched_text,
                    start=m.start(),
                    end=m.end(),
                    confidence=confidence,
                ))
        
        # Sort by position
        matches.sort(key=lambda x: x.start)
        return matches
    
    def redact_text(self, text: str, replacement: str = "[REDACTED]") -> str:
        """
        Replace all detected PII in text with a redaction marker.
        
        Args:
            text: Source text
            replacement: Replacement string (default: [REDACTED])
            
        Returns:
            Text with PII replaced
        """
        matches = self.detect(text)
        if not matches:
            return text
        
        # Apply replacements in reverse order to preserve offsets
        result = text
        for match in reversed(matches):
            label = f"[{match.pii_type} {replacement}]"
            result = result[:match.start] + label + result[match.end:]
        
        return result

    @staticmethod
    def _validate_ssn(text: str) -> bool:
        """Validate SSN format (exclude known invalid patterns)."""
        digits = re.sub(r'[\s\-]', '', text)
        if len(digits) != 9:
            return False
        # SSN cannot start with 000, 666, or 900-999
        area = int(digits[:3])
        if area == 0 or area == 666 or area >= 900:
            return False
        # Group and serial cannot be all zeros
        if digits[3:5] == "00" or digits[5:] == "0000":
            return False
        return True

    @staticmethod
    def _validate_luhn(text: str) -> bool:
        """Validate credit card number using Luhn algorithm."""
        digits = re.sub(r'[\s\-]', '', text)
        if not digits.isdigit() or len(digits) < 13 or len(digits) > 19:
            return False
        
        total = 0
        reverse = digits[::-1]
        for i, d in enumerate(reverse):
            n = int(d)
            if i % 2 == 1:
                n *= 2
                if n > 9:
                    n -= 9
            total += n
        
        return total % 10 == 0


# Singleton
_detector = None


def get_pii_detector(enabled_types: List[str] = None) -> PIIDetector:
    """Get PII detector instance."""
    global _detector
    if _detector is None:
        _detector = PIIDetector(enabled_types)
    return _detector
