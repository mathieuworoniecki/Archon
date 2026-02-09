"""
Archon Backend - Export API Routes
Export documents and search results as PDF/CSV
"""
from typing import List
from io import BytesIO
import csv
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models import Document

router = APIRouter(prefix="/export", tags=["export"])


class ExportRequest(BaseModel):
    """Request body for export endpoints."""
    document_ids: List[int]
    include_content: bool = False
    include_metadata: bool = True


@router.post("/csv")
def export_csv(
    request: ExportRequest,
    db: Session = Depends(get_db)
):
    """
    Export selected documents as CSV file.
    """
    documents = db.query(Document).filter(
        Document.id.in_(request.document_ids)
    ).all()
    
    if not documents:
        raise HTTPException(status_code=404, detail="No documents found")
    
    # Create CSV in memory
    output = BytesIO()
    
    # Write BOM for Excel compatibility
    output.write(b'\xef\xbb\xbf')
    
    # Define columns
    fieldnames = ['ID', 'Fichier', 'Chemin', 'Type', 'Taille (bytes)', 'Indexé le']
    if request.include_metadata:
        fieldnames.extend(['Scan ID', 'Archive'])
    if request.include_content:
        fieldnames.append('Contenu (extrait)')
    
    # Write CSV
    import io
    text_wrapper = io.TextIOWrapper(output, encoding='utf-8', newline='')
    writer = csv.DictWriter(text_wrapper, fieldnames=fieldnames)
    writer.writeheader()
    
    for doc in documents:
        row = {
            'ID': doc.id,
            'Fichier': doc.file_name,
            'Chemin': doc.file_path,
            'Type': doc.file_type,
            'Taille (bytes)': doc.file_size or 0,
            'Indexé le': doc.indexed_at.isoformat() if doc.indexed_at else ''
        }
        if request.include_metadata:
            row['Scan ID'] = doc.scan_id
            row['Archive'] = doc.archive_path or ''
        if request.include_content:
            content = doc.text_content or ''
            row['Contenu (extrait)'] = content[:500] + '...' if len(content) > 500 else content
        
        writer.writerow(row)
    
    text_wrapper.flush()
    output.seek(0)
    
    filename = f"archon-export-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    
    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.post("/pdf")
def export_pdf(
    request: ExportRequest,
    db: Session = Depends(get_db)
):
    """
    Export selected documents as PDF report.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF generation not available")
    
    documents = db.query(Document).filter(
        Document.id.in_(request.document_ids)
    ).all()
    
    if not documents:
        raise HTTPException(status_code=404, detail="No documents found")
    
    # Create PDF
    pdf = fitz.open()
    
    # Title page
    page = pdf.new_page()
    rect = fitz.Rect(50, 50, page.rect.width - 50, 150)
    page.insert_textbox(rect, "ARCHON - Rapport d'Export", fontsize=24, fontname="helv")
    
    date_rect = fitz.Rect(50, 160, page.rect.width - 50, 200)
    page.insert_textbox(date_rect, f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')}", fontsize=12, fontname="helv")
    
    count_rect = fitz.Rect(50, 210, page.rect.width - 50, 250)
    page.insert_textbox(count_rect, f"Documents: {len(documents)}", fontsize=12, fontname="helv")
    
    # Document list
    y_pos = 280
    for i, doc in enumerate(documents, 1):
        if y_pos > page.rect.height - 100:
            page = pdf.new_page()
            y_pos = 50
        
        # Document entry
        doc_rect = fitz.Rect(50, y_pos, page.rect.width - 50, y_pos + 60)
        text = f"{i}. {doc.file_name}\n   Type: {doc.file_type} | Taille: {doc.file_size or 0} bytes\n   Chemin: {doc.file_path[:80]}..."
        page.insert_textbox(doc_rect, text, fontsize=10, fontname="helv")
        y_pos += 70
        
        # Optional content preview
        if request.include_content and doc.text_content:
            content_preview = doc.text_content[:300] + '...' if len(doc.text_content) > 300 else doc.text_content
            content_rect = fitz.Rect(70, y_pos, page.rect.width - 50, y_pos + 50)
            page.insert_textbox(content_rect, content_preview, fontsize=8, fontname="helv", color=(0.4, 0.4, 0.4))
            y_pos += 60
    
    # Save to bytes
    output = BytesIO()
    pdf.save(output)
    pdf.close()
    output.seek(0)
    
    filename = f"archon-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.pdf"
    
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.get("/search-results/csv")
def export_search_results_csv(
    query: str = Query(..., description="Search query"),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db)
):
    """
    Export search results directly as CSV.
    Performs a search and exports results.
    """
    from ..services.meilisearch import get_meilisearch_service
    
    meili = get_meilisearch_service()
    results = meili.search(query=query, limit=limit)
    
    if not results.get('hits'):
        raise HTTPException(status_code=404, detail="No results found")
    
    # Create CSV
    output = BytesIO()
    output.write(b'\xef\xbb\xbf')
    
    import io
    text_wrapper = io.TextIOWrapper(output, encoding='utf-8', newline='')
    
    fieldnames = ['ID', 'Fichier', 'Chemin', 'Type', 'Score', 'Extrait']
    writer = csv.DictWriter(text_wrapper, fieldnames=fieldnames)
    writer.writeheader()
    
    for hit in results['hits']:
        snippet = hit.get('_formatted', {}).get('content', '')[:200]
        writer.writerow({
            'ID': hit.get('document_id', ''),
            'Fichier': hit.get('file_name', ''),
            'Chemin': hit.get('file_path', ''),
            'Type': hit.get('file_type', ''),
            'Score': hit.get('_rankingScore', ''),
            'Extrait': snippet
        })
    
    text_wrapper.flush()
    output.seek(0)
    
    filename = f"archon-search-{query[:20].replace(' ', '_')}-{datetime.now().strftime('%Y%m%d')}.csv"
    
    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


# =============================================================================
# Concordance DAT / Opticon OPT — Industry standard eDiscovery export
# =============================================================================

# Concordance delimiters (industry standard)
CONCORDANCE_QUOTE = chr(254)       # þ — field enclosure
CONCORDANCE_DELIMITER = chr(20)    # ¶ — field separator
CONCORDANCE_NEWLINE = chr(174)     # ® — in-field newline replacement

# Standard Concordance DAT field names
DAT_FIELDS = [
    "DOCID", "BEGDOC", "ENDDOC", "BATES_BEGIN", "BATES_END",
    "CUSTODIAN", "FILE_NAME", "FILE_PATH", "FILE_TYPE", "FILE_SIZE",
    "DATE_CREATED", "DATE_MODIFIED", "DATE_INDEXED",
    "MD5_HASH", "SHA256_HASH", "TEXT_EXTRACTED", "ARCHIVE_SOURCE",
    "SCAN_ID"
]


class DATExportRequest(BaseModel):
    """Request body for DAT/OPT export."""
    document_ids: List[int]
    bates_prefix: str = "ARCHON"
    bates_start: int = 1
    include_text: bool = False


def _concordance_encode(value: str) -> str:
    """Encode a value for Concordance DAT format.
    
    - Wrap in þ (chr 254)
    - Replace internal newlines with ® (chr 174)
    """
    if value is None:
        value = ""
    clean = str(value).replace("\r\n", CONCORDANCE_NEWLINE).replace("\n", CONCORDANCE_NEWLINE)
    return f"{CONCORDANCE_QUOTE}{clean}{CONCORDANCE_QUOTE}"


def _make_bates(prefix: str, number: int, padding: int = 7) -> str:
    """Generate a Bates number like ARCHON0000001."""
    return f"{prefix}{str(number).zfill(padding)}"


@router.post("/dat")
def export_dat(
    request: DATExportRequest,
    db: Session = Depends(get_db)
):
    """
    Export selected documents as Concordance DAT load file.
    
    The DAT format uses special delimiters:
    - Field enclosure: þ (ASCII 254)
    - Field separator: ¶ (ASCII 20)  
    - Newline replacement: ® (ASCII 174)
    
    Compatible with: Relativity, Concordance, DISCO, Nuix, etc.
    """
    documents = db.query(Document).filter(
        Document.id.in_(request.document_ids)
    ).all()
    
    if not documents:
        raise HTTPException(status_code=404, detail="No documents found")
    
    lines = []
    
    # Header row
    header = CONCORDANCE_DELIMITER.join(
        _concordance_encode(field) for field in DAT_FIELDS
    )
    lines.append(header)
    
    # Data rows
    for i, doc in enumerate(documents):
        bates_num = request.bates_start + i
        bates_id = _make_bates(request.bates_prefix, bates_num)
        
        text_value = ""
        if request.include_text and doc.text_content:
            # Truncate to 32KB for DAT (full text goes in separate text files)
            text_value = doc.text_content[:32768]
        
        row_values = [
            str(doc.id),                                           # DOCID
            bates_id,                                              # BEGDOC
            bates_id,                                              # ENDDOC (same for single-page)
            bates_id,                                              # BATES_BEGIN
            bates_id,                                              # BATES_END
            "",                                                    # CUSTODIAN
            doc.file_name or "",                                   # FILE_NAME
            doc.file_path or "",                                   # FILE_PATH
            doc.file_type.value if doc.file_type else "",          # FILE_TYPE
            str(doc.file_size or 0),                               # FILE_SIZE
            "",                                                    # DATE_CREATED
            doc.file_modified_at.isoformat() if doc.file_modified_at else "",  # DATE_MODIFIED
            doc.indexed_at.isoformat() if doc.indexed_at else "",  # DATE_INDEXED
            doc.hash_md5 or "",                                    # MD5_HASH
            doc.hash_sha256 or "",                                 # SHA256_HASH
            text_value,                                            # TEXT_EXTRACTED
            doc.archive_path or "",                                # ARCHIVE_SOURCE
            str(doc.scan_id),                                      # SCAN_ID
        ]
        
        row = CONCORDANCE_DELIMITER.join(
            _concordance_encode(v) for v in row_values
        )
        lines.append(row)
    
    content = "\r\n".join(lines) + "\r\n"  # CRLF line endings per spec
    output = BytesIO(content.encode("utf-8"))
    
    filename = f"archon-loadfile-{datetime.now().strftime('%Y%m%d-%H%M%S')}.dat"
    
    return StreamingResponse(
        output,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.post("/opt")
def export_opt(
    request: DATExportRequest,
    db: Session = Depends(get_db)
):
    """
    Export selected documents as Opticon OPT load file.
    
    OPT format: comma-separated, one line per image/page.
    Fields: BatesID,VolumeLabel,ImagePath,DocBreak,FolderPath,BoxLabel,PagesCount
    
    Compatible with: Relativity, Concordance, IPRO, LAW.
    """
    documents = db.query(Document).filter(
        Document.id.in_(request.document_ids)
    ).all()
    
    if not documents:
        raise HTTPException(status_code=404, detail="No documents found")
    
    lines = []
    
    for i, doc in enumerate(documents):
        bates_num = request.bates_start + i
        bates_id = _make_bates(request.bates_prefix, bates_num)
        
        # Construct image path (relative, as expected by review platforms)
        image_path = f"IMAGES\\{bates_id}.tif"
        volume_label = "VOL001"
        
        # Y = document break (first page of new document), empty = continuation
        doc_break = "Y"
        folder_path = ""
        box_label = ""
        page_count = "1"  # Single page per document (multi-page would expand)
        
        line = f"{bates_id},{volume_label},{image_path},{doc_break},{folder_path},{box_label},{page_count}"
        lines.append(line)
    
    content = "\r\n".join(lines) + "\r\n"
    output = BytesIO(content.encode("utf-8"))
    
    filename = f"archon-loadfile-{datetime.now().strftime('%Y%m%d-%H%M%S')}.opt"
    
    return StreamingResponse(
        output,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


# =============================================================================
# Redacted PDF Export with PII Detection + Bates Numbering
# =============================================================================

class RedactedPDFRequest(BaseModel):
    """Request body for redacted PDF export."""
    document_ids: List[int]
    bates_prefix: str = "ARCHON"
    bates_start: int = 1
    redact_pii: bool = True
    pii_types: List[str] = []   # Empty = all types
    bates_only: bool = False    # If True, skip PII redaction, only stamp Bates


@router.post("/redacted-pdf")
def export_redacted_pdf(
    request: RedactedPDFRequest,
    db: Session = Depends(get_db)
):
    """
    Export documents as a single PDF with:
    - Bates numbering on every page (bottom-right stamp)
    - Optional PII redaction (SSN, credit cards, emails, phones, etc.)
    
    PII redaction uses PyMuPDF's redact_annot which physically removes text
    from the PDF, making it forensically irreversible.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF generation not available")
    
    documents = db.query(Document).filter(
        Document.id.in_(request.document_ids)
    ).all()
    
    if not documents:
        raise HTTPException(status_code=404, detail="No documents found")
    
    # Initialize PII detector if needed
    detector = None
    if request.redact_pii and not request.bates_only:
        from ..services.pii_detector import get_pii_detector
        enabled = request.pii_types if request.pii_types else None
        detector = get_pii_detector(enabled)
    
    # Create output PDF
    output_pdf = fitz.open()
    bates_counter = request.bates_start
    
    for doc in documents:
        doc_pdf = None
        
        try:
            # Try to open original PDF if it exists and is a PDF
            if doc.file_type and doc.file_type.value == "pdf" and doc.file_path:
                try:
                    doc_pdf = fitz.open(doc.file_path)
                except Exception:
                    doc_pdf = None
            
            if doc_pdf is None:
                # Create a text-based PDF page from document content
                doc_pdf = fitz.open()
                page = doc_pdf.new_page()
                
                # Title
                title_rect = fitz.Rect(50, 30, page.rect.width - 50, 60)
                page.insert_textbox(
                    title_rect,
                    doc.file_name or "Unknown Document",
                    fontsize=14, fontname="helv"
                )
                
                # Content
                content = doc.text_content or "[No text content available]"
                content_rect = fitz.Rect(50, 70, page.rect.width - 50, page.rect.height - 80)
                page.insert_textbox(
                    content_rect,
                    content[:4000],  # Limit per page
                    fontsize=9, fontname="helv"
                )
            
            # Process each page
            for page_idx in range(len(doc_pdf)):
                page = doc_pdf[page_idx]
                
                # --- PII Redaction ---
                if detector:
                    text_dict = page.get_text("dict")
                    for block in text_dict.get("blocks", []):
                        if block.get("type") != 0:  # text block only
                            continue
                        for line in block.get("lines", []):
                            for span in line.get("spans", []):
                                span_text = span.get("text", "")
                                pii_matches = detector.detect(span_text)
                                if pii_matches:
                                    # Redact the entire span that contains PII
                                    bbox = fitz.Rect(span["bbox"])
                                    page.add_redact_annot(
                                        bbox,
                                        text="[REDACTED]",
                                        fontsize=8,
                                        fill=(0, 0, 0),       # black fill
                                        text_color=(1, 1, 1), # white text
                                    )
                    
                    # Apply all redactions (physically removes text)
                    page.apply_redactions()
                
                # --- Bates Stamp ---
                bates_id = _make_bates(request.bates_prefix, bates_counter)
                bates_counter += 1
                
                # Bottom-right corner stamp
                stamp_rect = fitz.Rect(
                    page.rect.width - 200,
                    page.rect.height - 30,
                    page.rect.width - 20,
                    page.rect.height - 10
                )
                page.insert_textbox(
                    stamp_rect,
                    bates_id,
                    fontsize=8,
                    fontname="helv",
                    color=(0.3, 0.3, 0.3),
                    align=fitz.TEXT_ALIGN_RIGHT
                )
            
            # Append all pages to output
            output_pdf.insert_pdf(doc_pdf)
        
        except Exception as e:
            # On error, add an error page
            err_page = output_pdf.new_page()
            err_rect = fitz.Rect(50, 50, err_page.rect.width - 50, 150)
            err_page.insert_textbox(
                err_rect,
                f"Error processing: {doc.file_name}\n{str(e)[:200]}",
                fontsize=10, fontname="helv", color=(0.8, 0, 0)
            )
        
        finally:
            if doc_pdf:
                doc_pdf.close()
    
    # Save to bytes
    output = BytesIO()
    output_pdf.save(output)
    output_pdf.close()
    output.seek(0)
    
    suffix = "redacted" if request.redact_pii else "bates"
    filename = f"archon-{suffix}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.pdf"
    
    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )

