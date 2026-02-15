"""
Archon Backend - Timeline API Routes
Provides date aggregation for timeline visualization
"""
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date, or_

from ..database import get_db
from ..models import Document, DocumentType, User
from pydantic import BaseModel
from ..utils.auth import get_current_user


router = APIRouter(prefix="/timeline", tags=["timeline"])


class TimelineDataPoint(BaseModel):
    """A single data point in the timeline."""
    date: str
    count: int
    by_type: dict  # {"pdf": 5, "image": 3, "text": 2}


class TimelineResponse(BaseModel):
    """Response for timeline aggregation."""
    granularity: str
    date_from: Optional[str]
    date_to: Optional[str]
    total_documents: int
    data: List[TimelineDataPoint]


class DateSourceCount(BaseModel):
    source: str
    count: int


class TimelineQualityResponse(BaseModel):
    """
    Quality/coverage metrics for timeline dates.

    `intrinsic_documents` counts documents with `document_date` extracted from the file itself.
    Timeline buckets use `coalesce(document_date, file_modified_at, indexed_at)`; this endpoint
    helps users understand how much of the timeline is based on intrinsic dates vs fallbacks.
    """
    total_documents: int
    intrinsic_documents: int
    intrinsic_share: float
    fallback_documents: int
    sources: List[DateSourceCount]


def _build_date_key_expr(granularity: str, source_date, db: Session):
    """Return SQL expression for bucket key compatible with active SQL dialect."""
    dialect_name = ""
    if db.bind is not None and db.bind.dialect is not None:
        dialect_name = db.bind.dialect.name

    if dialect_name == "sqlite":
        sqlite_formats = {
            "day": "%Y-%m-%d",
            "week": "%Y-W%W",
            "month": "%Y-%m",
            "year": "%Y",
        }
        return func.strftime(sqlite_formats[granularity], source_date)

    # PostgreSQL path
    pg_formats = {
        "day": "YYYY-MM-DD",
        "week": "IYYY-\"W\"IW",
        "month": "YYYY-MM",
        "year": "YYYY",
    }
    return func.to_char(source_date, pg_formats[granularity])


@router.get("/aggregation", response_model=TimelineResponse)
def get_timeline_aggregation(
    granularity: str = Query("day", pattern="^(day|week|month|year)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    scan_id: Optional[int] = None,
    project_path: Optional[str] = Query(None, min_length=1, max_length=1024),
    file_types: Optional[List[DocumentType]] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get document counts aggregated by date.
    
    Granularity options:
    - day: Each day as a data point
    - week: Each week (ISO week number)
    - month: Each month
    - year: Each year
    
    Returns a list of data points with counts and breakdown by file type.
    Uses SQL-level aggregation to handle millions of documents efficiently.
    """
    # Prefer intrinsic document dates (PDF metadata / email headers / EXIF) when available.
    # Fallback to filesystem modified_at then indexed_at.
    source_date = func.coalesce(Document.document_date, Document.file_modified_at, Document.indexed_at)
    date_key_expr = _build_date_key_expr(granularity, source_date, db)
    
    # Base filter conditions
    base_filters = [source_date.isnot(None)]
    if scan_id:
        base_filters.append(Document.scan_id == scan_id)
    if project_path:
        normalized_project_path = project_path.rstrip("/\\")
        base_filters.append(
            or_(
                Document.file_path == normalized_project_path,
                Document.file_path.like(f"{normalized_project_path}/%"),
            )
        )
    if file_types:
        base_filters.append(Document.file_type.in_(file_types))
    if date_from:
        base_filters.append(cast(source_date, Date) >= date_from)
    if date_to:
        base_filters.append(cast(source_date, Date) <= date_to)
    
    # Query 1: Get total count per date bucket
    totals_query = (
        db.query(
            date_key_expr.label("date_key"),
            func.count(Document.id).label("count")
        )
        .filter(*base_filters)
        .group_by(date_key_expr)
        .order_by(date_key_expr)
        .all()
    )
    
    # Query 2: Get count per date bucket + file type breakdown
    type_query = (
        db.query(
            date_key_expr.label("date_key"),
            Document.file_type,
            func.count(Document.id).label("type_count")
        )
        .filter(*base_filters)
        .group_by(date_key_expr, Document.file_type)
        .all()
    )
    
    # Build by_type lookup: {date_key: {file_type: count}}
    by_type_map = {}
    for row in type_query:
        key = row.date_key
        file_type = row.file_type.value if row.file_type else "unknown"
        if key not in by_type_map:
            by_type_map[key] = {}
        by_type_map[key][file_type] = row.type_count
    
    # Assemble response
    total_documents = sum(r.count for r in totals_query)
    data = [
        TimelineDataPoint(
            date=r.date_key,
            count=r.count,
            by_type=by_type_map.get(r.date_key, {})
        )
        for r in totals_query
    ]
    
    return TimelineResponse(
        granularity=granularity,
        date_from=date_from.isoformat() if date_from else None,
        date_to=date_to.isoformat() if date_to else None,
        total_documents=total_documents,
        data=data
    )



@router.get("/range")
def get_timeline_range(
    scan_id: Optional[int] = None,
    project_path: Optional[str] = Query(None, min_length=1, max_length=1024),
    file_types: Optional[List[DocumentType]] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the date range of documents.
    
    Returns the earliest and latest file_modified_at dates.
    """
    source_date = func.coalesce(Document.document_date, Document.file_modified_at, Document.indexed_at)
    query = db.query(
        func.min(source_date).label("min_date"),
        func.max(source_date).label("max_date"),
        func.count(Document.id).label("total_count")
    ).filter(source_date.isnot(None))
    
    if scan_id:
        query = query.filter(Document.scan_id == scan_id)
    if project_path:
        normalized_project_path = project_path.rstrip("/\\")
        query = query.filter(
            or_(
                Document.file_path == normalized_project_path,
                Document.file_path.like(f"{normalized_project_path}/%"),
            )
        )
    if file_types:
        query = query.filter(Document.file_type.in_(file_types))
    
    result = query.first()
    
    return {
        "min_date": result.min_date.isoformat() if result.min_date else None,
        "max_date": result.max_date.isoformat() if result.max_date else None,
        "total_documents": result.total_count or 0
    }


@router.get("/quality", response_model=TimelineQualityResponse)
def get_timeline_quality(
    scan_id: Optional[int] = None,
    project_path: Optional[str] = Query(None, min_length=1, max_length=1024),
    file_types: Optional[List[DocumentType]] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return intrinsic date coverage metrics for the current filters.

    This endpoint is meant to support the Timeline UX and help investigators understand
    whether the timeline is meaningful (intrinsic dates) or mostly based on fallbacks.
    """
    base_filters = []
    if scan_id:
        base_filters.append(Document.scan_id == scan_id)
    if project_path:
        normalized_project_path = project_path.rstrip("/\\")
        base_filters.append(
            or_(
                Document.file_path == normalized_project_path,
                Document.file_path.like(f"{normalized_project_path}/%"),
            )
        )
    if file_types:
        base_filters.append(Document.file_type.in_(file_types))

    total_documents = (
        db.query(func.count(Document.id))
        .filter(*base_filters)
        .scalar()
    ) or 0

    intrinsic_documents = (
        db.query(func.count(Document.id))
        .filter(*base_filters, Document.document_date.isnot(None))
        .scalar()
    ) or 0

    fallback_documents = max(0, int(total_documents) - int(intrinsic_documents))
    intrinsic_share = (float(intrinsic_documents) / float(total_documents)) if total_documents else 0.0

    sources_rows = (
        db.query(
            Document.document_date_source.label("source"),
            func.count(Document.id).label("count"),
        )
        .filter(
            *base_filters,
            Document.document_date.isnot(None),
            Document.document_date_source.isnot(None),
        )
        .group_by(Document.document_date_source)
        .order_by(func.count(Document.id).desc())
        .limit(12)
        .all()
    )

    sources = [
        DateSourceCount(source=row.source or "unknown", count=int(row.count or 0))
        for row in sources_rows
    ]

    return TimelineQualityResponse(
        total_documents=int(total_documents),
        intrinsic_documents=int(intrinsic_documents),
        intrinsic_share=float(intrinsic_share),
        fallback_documents=int(fallback_documents),
        sources=sources,
    )
