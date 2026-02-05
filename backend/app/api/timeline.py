"""
War Room Backend - Timeline API Routes
Provides date aggregation for timeline visualization
"""
from datetime import datetime, date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, cast, Date

from ..database import get_db
from ..models import Document, DocumentType
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
    """
    query = db.query(Document).filter(Document.file_modified_at.isnot(None))
    
    # Apply filters
    if scan_id:
        query = query.filter(Document.scan_id == scan_id)
    if date_from:
        query = query.filter(cast(Document.file_modified_at, Date) >= date_from)
    if date_to:
        query = query.filter(cast(Document.file_modified_at, Date) <= date_to)
    
    # Get all matching documents
    documents = query.all()
    
    # Aggregate by date
    aggregation = {}
    
    for doc in documents:
        if not doc.file_modified_at:
            continue
            
        # Determine the grouping key based on granularity
        dt = doc.file_modified_at
        
        if granularity == "day":
            key = dt.strftime("%Y-%m-%d")
        elif granularity == "week":
            # ISO week: year + week number
            key = f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"
        elif granularity == "month":
            key = dt.strftime("%Y-%m")
        else:  # year
            key = str(dt.year)
        
        if key not in aggregation:
            aggregation[key] = {"count": 0, "by_type": {}}
        
        aggregation[key]["count"] += 1
        
        # Count by file type
        file_type = doc.file_type.value if doc.file_type else "unknown"
        if file_type not in aggregation[key]["by_type"]:
            aggregation[key]["by_type"][file_type] = 0
        aggregation[key]["by_type"][file_type] += 1
    
    # Convert to sorted list
    data = [
        TimelineDataPoint(
            date=key,
            count=val["count"],
            by_type=val["by_type"]
        )
        for key, val in sorted(aggregation.items())
    ]
    
    return TimelineResponse(
        granularity=granularity,
        date_from=date_from.isoformat() if date_from else None,
        date_to=date_to.isoformat() if date_to else None,
        total_documents=len(documents),
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
