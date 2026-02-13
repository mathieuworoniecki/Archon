"""
Archon Backend - Redaction Detection Service
Detects whether a document has been redacted by identifying
common redaction markers in its text content.
"""
import re
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class RedactionResult:
    """Result of scanning a document for redaction markers."""
    is_redacted: bool
    marker_count: int
    markers_found: list[str]  # Unique marker types detected
    confidence: float  # 0.0 – 1.0


# ── Redaction marker patterns ──────────────────────────

# Explicit text markers placed by redacting tools
_EXPLICIT_MARKERS = re.compile(
    r'\[REDACTED\]'
    r'|\[EXPURGÉ\]'
    r'|\bEXPURGÉ\b'
    r'|\bCENSORED\b'
    r'|\bWITHHELD\b'
    r'|\bSEALED\b'
    r'|\bXXXX{2,}'
    r'|\b_{5,}\b'
    r'|█{3,}'
    r'|▓{3,}'
    r'|▒{3,}'
    r'|■{3,}',
    re.IGNORECASE
)

# Government-style classification + withholding patterns
_CLASSIFICATION_MARKERS = re.compile(
    r'\b(?:b\(\d+\))'                       # b(1), b(6), b(7) – FOIA exemptions
    r'|\b(?:FOIA|FOIA\s+EXEMPT)'             # FOIA mentions
    r'|\b(?:Exemption\s+\d)'                  # Exemption 1, Exemption 7
    r'|\b(?:Classified\s+by|Declassified\s+on)'
    r'|\b(?:Confidential|Top\s+Secret|Secret)\s*[-–:]\s*',
    re.IGNORECASE
)

# Repeated character patterns that often indicate obscured text
_OBSCURED_PATTERNS = re.compile(
    r'(?:\*{5,})'           # *****
    r'|(?:-{10,})'          # ---------- (10+ dashes)
    r'|(?:\.{10,})'         # .......... (10+ dots)
    r'|(?:##{5,})',          # ##### (5+ hashes)
    re.IGNORECASE
)


def detect_redaction(text: Optional[str]) -> RedactionResult:
    """
    Analyze text content for signs of redaction.
    
    Uses a multi-signal approach:
    - Explicit redaction markers ([REDACTED], XXXX, block chars)
    - Government classification patterns (FOIA exemptions, classified markings)
    - Obscured text patterns (repeated chars that mask content)
    
    Returns a RedactionResult with confidence based on the number and type
    of markers found.
    """
    if not text or len(text.strip()) < 10:
        return RedactionResult(
            is_redacted=False,
            marker_count=0,
            markers_found=[],
            confidence=0.0
        )
    
    markers_found: set[str] = set()
    total_count = 0
    
    # Check explicit markers (highest confidence)
    explicit_matches = _EXPLICIT_MARKERS.findall(text)
    if explicit_matches:
        total_count += len(explicit_matches)
        markers_found.add("explicit")
    
    # Check classification patterns
    class_matches = _CLASSIFICATION_MARKERS.findall(text)
    if class_matches:
        total_count += len(class_matches)
        markers_found.add("classification")
    
    # Check obscured patterns
    obscured_matches = _OBSCURED_PATTERNS.findall(text)
    if obscured_matches:
        total_count += len(obscured_matches)
        markers_found.add("obscured")
    
    # Calculate confidence
    if total_count == 0:
        confidence = 0.0
    elif "explicit" in markers_found:
        confidence = min(0.6 + (total_count * 0.05), 1.0)
    elif "classification" in markers_found:
        confidence = min(0.4 + (total_count * 0.05), 0.9)
    else:
        confidence = min(0.2 + (total_count * 0.05), 0.7)
    
    is_redacted = total_count >= 1 and confidence >= 0.2
    
    return RedactionResult(
        is_redacted=is_redacted,
        marker_count=total_count,
        markers_found=sorted(markers_found),
        confidence=round(confidence, 2)
    )
