"""
Archon Backend - Entities API Routes
Provides access to extracted named entities
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models import Entity, Document
from pydantic import BaseModel


router = APIRouter(prefix="/entities", tags=["entities"])


class EntityResponse(BaseModel):
    """Response for a single entity."""
    id: int
    text: str
    type: str
    count: int
    document_id: int
    file_name: Optional[str] = None

    class Config:
        from_attributes = True


class EntityAggregation(BaseModel):
    """Aggregated entity with total count across documents."""
    text: str
    type: str
    total_count: int
    document_count: int


class EntityTypeSummary(BaseModel):
    """Summary of entities by type."""
    type: str
    count: int
    unique_count: int


@router.get("/", response_model=List[EntityAggregation])
def list_entities(
    entity_type: Optional[str] = Query(None, regex="^(PER|ORG|LOC|MISC|DATE)$"),
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """
    List unique entities aggregated across all documents.
    
    Returns entities sorted by total occurrence count.
    """
    query = db.query(
        Entity.text,
        Entity.type,
        func.sum(Entity.count).label("total_count"),
        func.count(Entity.document_id.distinct()).label("document_count")
    ).group_by(Entity.text, Entity.type)
    
    if entity_type:
        query = query.filter(Entity.type == entity_type)
    
    if search:
        query = query.filter(Entity.text.ilike(f"%{search}%"))
    
    query = query.order_by(func.sum(Entity.count).desc())
    query = query.limit(limit)
    
    results = query.all()
    
    return [
        EntityAggregation(
            text=r.text,
            type=r.type,
            total_count=r.total_count,
            document_count=r.document_count
        )
        for r in results
    ]


@router.get("/types", response_model=List[EntityTypeSummary])
def get_entity_types(db: Session = Depends(get_db)):
    """
    Get summary of entities by type.
    
    Returns count of total occurrences and unique entities per type.
    """
    results = db.query(
        Entity.type,
        func.sum(Entity.count).label("count"),
        func.count(Entity.text.distinct()).label("unique_count")
    ).group_by(Entity.type).all()
    
    return [
        EntityTypeSummary(
            type=r.type,
            count=r.count or 0,
            unique_count=r.unique_count or 0
        )
        for r in results
    ]


@router.get("/document/{document_id}", response_model=List[EntityResponse])
def get_document_entities(
    document_id: int,
    entity_type: Optional[str] = Query(None, regex="^(PER|ORG|LOC|MISC|DATE)$"),
    db: Session = Depends(get_db)
):
    """
    Get all entities extracted from a specific document.
    """
    query = db.query(Entity).filter(Entity.document_id == document_id)
    
    if entity_type:
        query = query.filter(Entity.type == entity_type)
    
    query = query.order_by(Entity.count.desc())
    
    return query.all()


@router.get("/search")
def search_by_entity(
    text: str = Query(..., min_length=2),
    entity_type: Optional[str] = Query(None, regex="^(PER|ORG|LOC|MISC|DATE)$"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Find documents containing a specific entity.
    
    Returns list of document IDs and file names matching the entity.
    """
    query = db.query(
        Entity.document_id,
        Document.file_name,
        Document.file_path,
        Entity.count
    ).join(Document).filter(Entity.text.ilike(f"%{text}%"))
    
    if entity_type:
        query = query.filter(Entity.type == entity_type)
    
    query = query.order_by(Entity.count.desc()).limit(limit)
    
    results = query.all()
    
    return [
        {
            "document_id": r.document_id,
            "file_name": r.file_name,
            "file_path": r.file_path,
            "entity_count": r.count
        }
        for r in results
    ]
