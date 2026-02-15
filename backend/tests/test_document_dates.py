from datetime import datetime

import fitz

from app.models import DocumentType
from app.services.document_dates import (
    parse_pdf_date,
    extract_eml_document_date,
    extract_pdf_document_date,
    extract_document_date,
)


def test_parse_pdf_date_basic_utc():
    assert parse_pdf_date("D:20240215123000Z") == datetime(2024, 2, 15, 12, 30, 0)


def test_parse_pdf_date_date_only_defaults():
    assert parse_pdf_date("D:20240215") == datetime(2024, 2, 15, 0, 0, 0)


def test_parse_pdf_date_timezone_offset_converted_to_utc():
    # 12:30 at +01:00 => 11:30 UTC
    assert parse_pdf_date("D:20240215123000+01'00'") == datetime(2024, 2, 15, 11, 30, 0)


def test_extract_eml_document_date(tmp_path):
    eml = tmp_path / "sample.eml"
    eml.write_text(
        "\n".join(
            [
                "From: a@example.com",
                "To: b@example.com",
                "Date: Fri, 15 Feb 2024 12:34:56 +0000",
                "Subject: Test",
                "",
                "Hello",
                "",
            ]
        ),
        encoding="utf-8",
    )

    extracted = extract_eml_document_date(str(eml))
    assert extracted is not None
    dt, source = extracted
    assert dt == datetime(2024, 2, 15, 12, 34, 56)
    assert source == "email_date_header"


def test_extract_pdf_document_date(tmp_path):
    pdf = tmp_path / "sample.pdf"
    doc = fitz.open()
    doc.new_page()
    doc.set_metadata({"creationDate": "D:20240215123000Z"})
    doc.save(str(pdf))
    doc.close()

    extracted = extract_pdf_document_date(str(pdf))
    assert extracted is not None
    dt, source = extracted
    assert dt == datetime(2024, 2, 15, 12, 30, 0)
    assert source == "pdf_creation_date"


def test_extract_document_date_dispatch_eml(tmp_path):
    eml = tmp_path / "sample.eml"
    eml.write_text("Date: Fri, 15 Feb 2024 12:34:56 +0000\n\nBody", encoding="utf-8")

    extracted = extract_document_date(str(eml), DocumentType.EMAIL)
    assert extracted is not None
    dt, source = extracted
    assert dt == datetime(2024, 2, 15, 12, 34, 56)
    assert source == "email_date_header"

