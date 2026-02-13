"""
Archon Backend - Documents API Routes
"""
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..models import Document, DocumentType, User
from ..schemas import (
    DocumentDetail,
    DocumentListResponse,
    DocumentContentResponse,
    DocumentHighlightsResponse,
    DocumentDeleteResponse,
    DocumentRedactionResponse,
)
from ..utils.auth import get_current_user, require_role
from pydantic import BaseModel

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/", response_model=DocumentListResponse)
def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    scan_id: Optional[int] = None,
    project_path: Optional[str] = Query(None, min_length=1, max_length=1024),
    file_types: Optional[List[DocumentType]] = Query(None),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    search: Optional[str] = Query(None, min_length=1, max_length=200),
    sort_by: str = Query("indexed_desc", pattern="^(indexed_desc|indexed_asc|name_asc|name_desc|size_desc|size_asc|modified_desc|modified_asc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List documents with filters and sorting.
    
    Supports:
    - Multi-select file types
    - Project path prefix filter
    - Date range filters (on file_modified_at)
    - Text search on file name (case-insensitive)
    - Multiple sort options
    - Pagination with total count
    """
    query = db.query(Document)
    
    # Filter by scan
    if scan_id:
        query = query.filter(Document.scan_id == scan_id)

    # Filter by project path prefix
    if project_path:
        normalized_project_path = project_path.rstrip("/\\")
        query = query.filter(
            or_(
                Document.file_path == normalized_project_path,
                Document.file_path.like(f"{normalized_project_path}/%"),
            )
        )
    
    # Filter by file name (case-insensitive)
    if search:
        query = query.filter(Document.file_name.ilike(f"%{search}%"))
    
    # Filter by file types (multi-select)
    if file_types:
        query = query.filter(Document.file_type.in_(file_types))
    
    # Filter by date range (file modification date)
    if date_from:
        query = query.filter(Document.file_modified_at >= date_from)
    if date_to:
        query = query.filter(Document.file_modified_at <= date_to)
    
    # Get total count before pagination
    total = query.count()
    
    # Apply sorting
    sort_options = {
        "indexed_desc": Document.indexed_at.desc(),
        "indexed_asc": Document.indexed_at.asc(),
        "name_asc": Document.file_name.asc(),
        "name_desc": Document.file_name.desc(),
        "size_desc": Document.file_size.desc(),
        "size_asc": Document.file_size.asc(),
        "modified_desc": Document.file_modified_at.desc(),
        "modified_asc": Document.file_modified_at.asc(),
    }
    query = query.order_by(sort_options.get(sort_by, Document.indexed_at.desc()))
    
    # Apply pagination
    documents = query.offset(skip).limit(limit).all()
    
    return DocumentListResponse(
        documents=documents,
        total=total,
        skip=skip,
        limit=limit
    )


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get document details including text content."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.get("/{document_id}/content", response_model=DocumentContentResponse)
def get_document_content(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get document text content only. Triggers lazy OCR for videos."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Lazy Video OCR: trigger on first access
    if (document.file_type == DocumentType.VIDEO 
            and document.text_content 
            and document.text_content.startswith("[VIDEO] OCR déféré")):
        try:
            from ..services.ocr import get_ocr_service
            ocr_service = get_ocr_service()
            text_content, used_ocr = ocr_service.extract_text(document.file_path)
            if text_content and text_content.strip():
                document.text_content = text_content
                document.text_length = len(text_content)
                document.has_ocr = 1 if used_ocr else 0
                db.commit()
        except Exception:
            pass  # Return placeholder if OCR fails
    
    return {
        "document_id": document_id,
        "file_name": document.file_name,
        "text_content": document.text_content,
        "text_length": document.text_length
    }


@router.get("/{document_id}/file")
def get_document_file(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Get the original document file for viewing.
    
    Returns the file with appropriate content type for browser display.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    file_path = Path(document.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    # Determine content type
    content_types = {
        DocumentType.PDF: "application/pdf",
        DocumentType.IMAGE: None,  # Will be determined by extension
        DocumentType.TEXT: "text/plain; charset=utf-8",
        DocumentType.VIDEO: "video/mp4",  # Default, refined by extension below
    }
    
    content_type = content_types.get(document.file_type)
    
    # For images, determine type by extension
    if document.file_type == DocumentType.IMAGE:
        ext = file_path.suffix.lower()
        image_types = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
            ".tiff": "image/tiff",
            ".tif": "image/tiff"
        }
        content_type = image_types.get(ext, "application/octet-stream")
    
    # For videos, determine type by extension
    elif document.file_type == DocumentType.VIDEO:
        ext = file_path.suffix.lower()
        video_types = {
            ".mp4": "video/mp4",
            ".avi": "video/x-msvideo",
            ".mov": "video/quicktime",
            ".mkv": "video/x-matroska",
            ".webm": "video/webm",
            ".wmv": "video/x-ms-wmv",
            ".flv": "video/x-flv",
        }
        content_type = video_types.get(ext, "video/mp4")
    
    return FileResponse(
        path=str(file_path),
        media_type=content_type,
        filename=document.file_name,
        headers={
            "Content-Disposition": f"inline; filename=\"{document.file_name}\""
        }
    )


@router.get("/{document_id}/highlights", response_model=DocumentHighlightsResponse)
def get_document_highlights(
    document_id: int,
    query: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get highlight positions for a query within a document.
    
    Returns positions where the query matches in the document text.
    Useful for highlighting in the viewer.
    """
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if not document.text_content:
        return {"document_id": document_id, "query": query, "matches": []}
    
    # Find all occurrences (case-insensitive)
    text_lower = document.text_content.lower()
    query_lower = query.lower()
    
    matches = []
    start = 0
    
    while True:
        pos = text_lower.find(query_lower, start)
        if pos == -1:
            break
        
        # Get context around match
        context_start = max(0, pos - 50)
        context_end = min(len(document.text_content), pos + len(query) + 50)
        context = document.text_content[context_start:context_end]
        
        matches.append({
            "position": pos,
            "length": len(query),
            "context": context,
            "context_start": context_start
        })
        
        start = pos + 1
    
    return {
        "document_id": document_id,
        "query": query,
        "total_matches": len(matches),
        "matches": matches[:100]  # Limit to first 100 matches
    }


@router.delete("/{document_id}", response_model=DocumentDeleteResponse)
def delete_document(document_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_role("admin", "analyst"))):
    """Delete a document from database and search indices."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete from Meilisearch
    from ..services.meilisearch import get_meilisearch_service
    try:
        meili_service = get_meilisearch_service()
        meili_service.delete_document(document_id)
    except Exception:
        pass
    
    # Delete from Qdrant
    from ..services.qdrant import get_qdrant_service
    try:
        qdrant_service = get_qdrant_service()
        qdrant_service.delete_by_document(document_id)
    except Exception:
        pass
    
    # Delete from database
    db.delete(document)
    db.commit()
    
    return {"status": "deleted", "document_id": document_id}


@router.get("/{document_id}/thumbnail")
def get_document_thumbnail(
    document_id: int,
    size: int = Query(150, ge=50, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get a thumbnail for images and videos.
    
    For images: Returns a resized JPEG thumbnail.
    For videos: Returns first frame as thumbnail (if ffmpeg available).
    Uses caching for fast repeated access.
    """
    import hashlib

    
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    file_path = Path(document.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    ext = file_path.suffix.lower()
    
    # Cache directory
    cache_dir = Path("/tmp/archon_thumbnails")
    cache_dir.mkdir(exist_ok=True)
    
    # Cache key based on file path, modification time, and size
    cache_key = hashlib.md5(f"{document.file_path}:{document.file_modified_at}:{size}".encode()).hexdigest()
    cache_path = cache_dir / f"{cache_key}.jpg"
    
    # Return cached thumbnail if exists
    if cache_path.exists():
        return FileResponse(
            path=str(cache_path),
            media_type="image/jpeg"
        )
    
    # Generate thumbnail for images
    image_exts = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif"}
    video_exts = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
    
    if ext in image_exts:
        try:
            from PIL import Image
            
            with Image.open(file_path) as img:
                # Convert to RGB (for PNG with transparency, CMYK, etc.)
                if img.mode in ('RGBA', 'P', 'CMYK'):
                    img = img.convert('RGB')
                
                # Create thumbnail maintaining aspect ratio
                img.thumbnail((size, size), Image.Resampling.LANCZOS)
                
                # Save to cache
                img.save(cache_path, 'JPEG', quality=80, optimize=True)
            
            return FileResponse(
                path=str(cache_path),
                media_type="image/jpeg"
            )
        except Exception:
            # Fallback to original file
            return FileResponse(
                path=str(file_path),
                media_type="image/jpeg"
            )
    
    elif ext in video_exts:
        # Try to extract first frame with ffmpeg
        try:
            import subprocess
            subprocess.run([
                'ffmpeg', '-i', str(file_path),
                '-vf', f'scale={size}:-1',
                '-frames:v', '1',
                '-y', str(cache_path)
            ], capture_output=True, timeout=10)
            
            if cache_path.exists():
                return FileResponse(
                    path=str(cache_path),
                    media_type="image/jpeg"
                )
        except Exception:
            pass
        
        # Return placeholder for videos without thumbnail
        return Response(
            content=b'',
            media_type="image/jpeg",
            status_code=204
        )
    
    # Not a media file
    raise HTTPException(status_code=400, detail="Not a media file")


# ── Redaction Detection ────────────────────────────────


class RedactionScanRequest(BaseModel):
    """Request body for redaction scanning."""
    document_ids: Optional[List[int]] = None  # None = scan all unscanned
    force_rescan: bool = False


class RedactionScanResult(BaseModel):
    """Result of a batch redaction scan."""
    total_scanned: int
    redacted_count: int
    clean_count: int


@router.post("/redaction-scan", response_model=RedactionScanResult)
def scan_for_redactions(
    request: RedactionScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "analyst"))
):
    """
    Scan documents for redaction markers.
    
    - If document_ids is provided, scans those specific documents.
    - If document_ids is None, scans all documents without a redaction_status.
    - Set force_rescan=True to re-scan already-scanned documents.
    """
    from ..services.redaction_detector import detect_redaction
    
    query = db.query(Document)
    
    if request.document_ids:
        query = query.filter(Document.id.in_(request.document_ids))
    elif not request.force_rescan:
        query = query.filter(Document.redaction_status.is_(None))
    
    documents = query.limit(1000).all()
    
    redacted_count = 0
    clean_count = 0
    
    for doc in documents:
        result = detect_redaction(doc.text_content)
        
        if result.is_redacted:
            doc.redaction_status = "confirmed" if result.confidence >= 0.7 else "suspected"
            redacted_count += 1
        else:
            doc.redaction_status = "none"
            clean_count += 1
        
        doc.redaction_score = result.confidence
    
    db.commit()
    
    return RedactionScanResult(
        total_scanned=len(documents),
        redacted_count=redacted_count,
        clean_count=clean_count,
    )


@router.get("/{document_id}/redaction", response_model=DocumentRedactionResponse)
def get_document_redaction(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get redaction detection results for a specific document.
    Triggers on-demand scan if not yet scanned.
    """
    from ..services.redaction_detector import detect_redaction
    
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Scan on-demand if not yet scanned
    if document.redaction_status is None:
        result = detect_redaction(document.text_content)
        document.redaction_status = (
            "confirmed" if result.is_redacted and result.confidence >= 0.7
            else "suspected" if result.is_redacted
            else "none"
        )
        document.redaction_score = result.confidence
        db.commit()
    
    return {
        "document_id": document.id,
        "redaction_status": document.redaction_status,
        "redaction_score": document.redaction_score,
    }
