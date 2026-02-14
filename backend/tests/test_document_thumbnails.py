from datetime import datetime, timezone

import fitz

from app.models import Document, DocumentType, Scan, ScanStatus


def _create_scan(db_session, path: str) -> Scan:
    scan = Scan(
        path=path,
        status=ScanStatus.COMPLETED,
        total_files=1,
        processed_files=1,
        failed_files=0,
    )
    db_session.add(scan)
    db_session.flush()
    return scan


def _create_document(db_session, scan_id: int, file_path: str, file_name: str, file_type: DocumentType, file_size: int) -> Document:
    doc = Document(
        scan_id=scan_id,
        file_path=file_path,
        file_name=file_name,
        file_type=file_type,
        file_size=file_size,
        text_length=0,
        has_ocr=0,
        file_modified_at=datetime.now(timezone.utc),
        indexed_at=datetime.now(timezone.utc),
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    return doc


def test_thumbnail_from_pdf_first_page(client, db_session, admin_headers, temp_dir):
    pdf_path = temp_dir / "thumb.pdf"
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_text((72, 72), "Thumbnail PDF test")
    pdf.save(pdf_path)
    pdf.close()

    scan = _create_scan(db_session, str(temp_dir))
    doc = _create_document(
        db_session=db_session,
        scan_id=scan.id,
        file_path=str(pdf_path),
        file_name=pdf_path.name,
        file_type=DocumentType.PDF,
        file_size=pdf_path.stat().st_size,
    )

    response = client.get(f"/api/documents/{doc.id}/thumbnail", headers=admin_headers)
    assert response.status_code == 200
    assert response.headers.get("content-type", "").startswith("image/jpeg")
    assert len(response.content) > 0


def test_thumbnail_rejects_non_visual_file(client, db_session, admin_headers, temp_dir):
    text_path = temp_dir / "note.txt"
    text_path.write_text("not visual")

    scan = _create_scan(db_session, str(temp_dir))
    doc = _create_document(
        db_session=db_session,
        scan_id=scan.id,
        file_path=str(text_path),
        file_name=text_path.name,
        file_type=DocumentType.TEXT,
        file_size=text_path.stat().st_size,
    )

    response = client.get(f"/api/documents/{doc.id}/thumbnail", headers=admin_headers)
    assert response.status_code == 400
    assert "Not a media file" in response.text
