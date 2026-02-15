"""
Document intrinsic date extraction (forensics-oriented).

Goal:
- Prefer dates that belong to the document itself (PDF metadata, email headers, EXIF),
  not filesystem timestamps which often reflect copy/import time.

This module is intentionally conservative:
- Best-effort extraction with graceful failure.
- Returns a normalized UTC-naive datetime suitable for DB `DateTime` columns.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone, timedelta
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Optional, Tuple

import fitz  # PyMuPDF
from PIL import Image, ExifTags

from ..models import DocumentType


_PDF_DATE_PREFIX = "D:"
_EXIF_TAGS_BY_NAME = {name: tag for tag, name in ExifTags.TAGS.items()}


def _to_utc_naive(value: datetime) -> datetime:
    """
    Normalize to UTC-naive for storage.

    The DB schema uses timezone-naive `DateTime`. We store UTC values without tzinfo
    to keep ordering stable across environments.
    """
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value.replace(tzinfo=None)


def parse_pdf_date(value: str) -> Optional[datetime]:
    """
    Parse a PDF date string.

    Common formats:
    - D:YYYYMMDDHHmmSSZ
    - D:YYYYMMDDHHmmSS+01'00'
    - D:YYYYMMDDHHmmSS-05'00'
    - D:YYYYMMDD
    """
    if not value:
        return None

    raw = value.strip()
    if raw.startswith(_PDF_DATE_PREFIX):
        raw = raw[len(_PDF_DATE_PREFIX):]

    # Split timezone suffix if present (Z or +/-HH'mm').
    tzinfo = None
    tz_match = re.search(r"(Z|[+\-]\d{2}'?\d{2}'?)$", raw)
    if tz_match:
        tz_raw = tz_match.group(1)
        raw = raw[: -len(tz_raw)]
        if tz_raw == "Z":
            tzinfo = timezone.utc
        else:
            sign = 1 if tz_raw[0] == "+" else -1
            digits = re.sub(r"[^0-9]", "", tz_raw)
            if len(digits) >= 4:
                hours = int(digits[0:2])
                minutes = int(digits[2:4])
                tzinfo = timezone(sign * timedelta(hours=hours, minutes=minutes))

    digits = re.sub(r"[^0-9]", "", raw)
    if len(digits) < 4:
        return None

    year = int(digits[0:4])
    month = int(digits[4:6]) if len(digits) >= 6 else 1
    day = int(digits[6:8]) if len(digits) >= 8 else 1
    hour = int(digits[8:10]) if len(digits) >= 10 else 0
    minute = int(digits[10:12]) if len(digits) >= 12 else 0
    second = int(digits[12:14]) if len(digits) >= 14 else 0

    try:
        dt = datetime(year, month, day, hour, minute, second, tzinfo=tzinfo)
    except ValueError:
        return None

    # If no tz info, treat as UTC for stable ordering.
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    return _to_utc_naive(dt)


def extract_pdf_document_date(file_path: str) -> Optional[Tuple[datetime, str]]:
    """
    Extract a PDF intrinsic date from metadata.
    """
    try:
        doc = fitz.open(file_path)
    except Exception:
        return None

    try:
        meta = doc.metadata or {}
        # Prefer creation date, then modification date.
        for key, source in (
            ("creationDate", "pdf_creation_date"),
            ("modDate", "pdf_mod_date"),
        ):
            value = meta.get(key)
            if isinstance(value, str) and value.strip():
                parsed = parse_pdf_date(value)
                if parsed is not None:
                    return parsed, source
        return None
    finally:
        try:
            doc.close()
        except Exception:
            pass


def _parse_exif_datetime(value: str) -> Optional[datetime]:
    """
    Parse EXIF DateTime strings like "YYYY:MM:DD HH:MM:SS".
    """
    if not value:
        return None
    raw = value.strip()
    # EXIF commonly uses "YYYY:MM:DD HH:MM:SS"
    try:
        dt = datetime.strptime(raw, "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None
    return _to_utc_naive(dt)


def extract_image_document_date(file_path: str) -> Optional[Tuple[datetime, str]]:
    """
    Extract an image intrinsic date from EXIF.
    """
    try:
        with Image.open(file_path) as img:
            exif = img.getexif()
            if not exif:
                return None

            # Prefer DateTimeOriginal -> DateTimeDigitized -> DateTime
            candidates = [
                (_EXIF_TAGS_BY_NAME.get("DateTimeOriginal"), "exif_datetime_original"),
                (_EXIF_TAGS_BY_NAME.get("DateTimeDigitized"), "exif_datetime_digitized"),
                (_EXIF_TAGS_BY_NAME.get("DateTime"), "exif_datetime"),
            ]

            for tag, source in candidates:
                if not tag:
                    continue
                value = exif.get(tag)
                if isinstance(value, bytes):
                    try:
                        value = value.decode("utf-8", errors="ignore")
                    except Exception:
                        value = ""
                if isinstance(value, str) and value.strip():
                    parsed = _parse_exif_datetime(value)
                    if parsed is not None:
                        return parsed, source
            return None
    except Exception:
        return None


def extract_eml_document_date(file_path: str) -> Optional[Tuple[datetime, str]]:
    """
    Extract email Date header (RFC 2822) from .eml files.
    """
    try:
        data = Path(file_path).read_bytes()
    except Exception:
        return None

    try:
        msg = BytesParser(policy=policy.default).parsebytes(data)
    except Exception:
        return None

    try:
        date_header = msg.get("Date")
        if not date_header:
            return None
        dt = parsedate_to_datetime(date_header)
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return _to_utc_naive(dt), "email_date_header"
    except Exception:
        return None


def extract_document_date(file_path: str, file_type: DocumentType) -> Optional[Tuple[datetime, str]]:
    """
    Best-effort intrinsic date extraction for a file.
    """
    if file_type == DocumentType.PDF:
        return extract_pdf_document_date(file_path)

    if file_type == DocumentType.IMAGE:
        return extract_image_document_date(file_path)

    if file_type == DocumentType.EMAIL:
        ext = Path(file_path).suffix.lower()
        if ext == ".eml":
            return extract_eml_document_date(file_path)
        return None

    return None

