"""
War Room Backend - Documents API Routes
"""
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Document, DocumentType
from ..schemas import DocumentOut, DocumentDetail, DocumentListResponse

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("/", response_model=DocumentListResponse)
def list_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    scan_id: Optional[int] = None,
    file_types: Optional[List[DocumentType]] = Query(None),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    sort_by: str = Query("indexed_desc", regex="^(indexed_desc|indexed_asc|name_asc|name_desc|size_desc|size_asc|modified_desc|modified_asc)$"),
    db: Session = Depends(get_db)
):
    """
    List documents with filters and sorting.
    
    Supports:
    - Multi-select file types
    - Date range filters (on file_modified_at)
    - Multiple sort options
    - Pagination with total count
    """
    query = db.query(Document)
    
    # Filter by scan
    if scan_id:
        query = query.filter(Document.scan_id == scan_id)
    
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
def get_document(document_id: int, db: Session = Depends(get_db)):
    """Get document details including text content."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.get("/{document_id}/content")
def get_document_content(document_id: int, db: Session = Depends(get_db)):
    """Get document text content only."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        "document_id": document_id,
        "file_name": document.file_name,
        "text_content": document.text_content,
        "text_length": document.text_length
    }


@router.get("/{document_id}/file")
def get_document_file(document_id: int, db: Session = Depends(get_db)):
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
        DocumentType.TEXT: "text/plain; charset=utf-8"
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
    
    return FileResponse(
        path=str(file_path),
        media_type=content_type,
        filename=document.file_name,
        headers={
            "Content-Disposition": f"inline; filename=\"{document.file_name}\""
        }
    )


@router.get("/{document_id}/highlights")
def get_document_highlights(
    document_id: int,
    query: str = Query(..., min_length=1),
    db: Session = Depends(get_db)
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


@router.delete("/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db)):
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
