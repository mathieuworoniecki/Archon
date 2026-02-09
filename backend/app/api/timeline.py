"""
Archon Backend - Timeline API Routes
Provides date aggregation for timeline visualization
"""
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date

from ..database import get_db
from ..models import Document
from pydantic import BaseModel


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


@router.get("/aggregation", response_model=TimelineResponse)
def get_timeline_aggregation(
    granularity: str = Query("day", regex="^(day|week|month|year)$"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    scan_id: Optional[int] = None,
    db: Session = Depends(get_db)
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
    # Build PostgreSQL to_char format based on granularity
    granularity_formats = {
        "day": "YYYY-MM-DD",
        "week": "IYYY-\"W\"IW",
        "month": "YYYY-MM",
        "year": "YYYY",
    }
    date_format = granularity_formats[granularity]
    
    # PostgreSQL date grouping using func.to_char
    date_key = func.to_char(Document.file_modified_at, date_format).label("date_key")
    
    # Base filter conditions
    base_filters = [Document.file_modified_at.isnot(None)]
    if scan_id:
        base_filters.append(Document.scan_id == scan_id)
    if date_from:
        base_filters.append(cast(Document.file_modified_at, Date) >= date_from)
    if date_to:
        base_filters.append(cast(Document.file_modified_at, Date) <= date_to)
    
    # Query 1: Get total count per date bucket
    totals_query = (
        db.query(
            date_key,
            func.count(Document.id).label("count")
        )
        .filter(*base_filters)
        .group_by("date_key")
        .order_by("date_key")
        .all()
    )
    
    # Query 2: Get count per date bucket + file type breakdown
    type_query = (
        db.query(
            func.to_char(Document.file_modified_at, date_format).label("date_key"),
            Document.file_type,
            func.count(Document.id).label("type_count")
        )
        .filter(*base_filters)
        .group_by("date_key", Document.file_type)
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
    db: Session = Depends(get_db)
):
    """
    Get the date range of documents.
    
    Returns the earliest and latest file_modified_at dates.
    """
    query = db.query(
        func.min(Document.file_modified_at).label("min_date"),
        func.max(Document.file_modified_at).label("max_date"),
        func.count(Document.id).label("total_count")
    )
    
    if scan_id:
        query = query.filter(Document.scan_id == scan_id)
    
    result = query.first()
    
    return {
        "min_date": result.min_date.isoformat() if result.min_date else None,
        "max_date": result.max_date.isoformat() if result.max_date else None,
        "total_documents": result.total_count or 0
    }
