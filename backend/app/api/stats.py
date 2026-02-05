"""
War Room Backend - Stats API Routes
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Document, Scan, ScanStatus, DocumentType
from ..schemas import StatsResponse, DocumentsByType

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    """
    Get global statistics about indexed documents.
    
    Returns counts, type breakdown, scan info, and index size estimation.
    """
    # Total documents count
    total_documents = db.query(func.count(Document.id)).scalar() or 0
    
    # Documents by type
    type_counts = db.query(
        Document.file_type,
        func.count(Document.id)
    ).group_by(Document.file_type).all()
    
    documents_by_type = DocumentsByType(
        pdf=0,
        image=0,
        text=0,
        unknown=0
    )
    
    for file_type, count in type_counts:
        if file_type == DocumentType.PDF:
            documents_by_type.pdf = count
        elif file_type == DocumentType.IMAGE:
            documents_by_type.image = count
        elif file_type == DocumentType.TEXT:
            documents_by_type.text = count
        else:
            documents_by_type.unknown = count
    
    # Total scans count
    total_scans = db.query(func.count(Scan.id)).scalar() or 0
    
    # Last completed scan date
    last_scan = db.query(Scan).filter(
        Scan.status == ScanStatus.COMPLETED
    ).order_by(Scan.completed_at.desc()).first()
    
    last_scan_date = last_scan.completed_at if last_scan else None
    
    # Index size estimation (sum of text_length as rough indicator)
    index_size_bytes = db.query(func.sum(Document.text_length)).scalar() or 0
    
    # Also add file sizes for better estimation
    total_file_size = db.query(func.sum(Document.file_size)).scalar() or 0
    
    return StatsResponse(
        total_documents=total_documents,
        documents_by_type=documents_by_type,
        total_scans=total_scans,
        last_scan_date=last_scan_date,
        index_size_bytes=index_size_bytes,
        total_file_size_bytes=total_file_size
    )
