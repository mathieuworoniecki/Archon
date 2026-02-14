"""
Archon Backend - Entities API Routes
Provides access to extracted named entities
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, tuple_

from ..database import get_db
from ..models import Entity, Document, User
from pydantic import BaseModel, ConfigDict
from ..utils.auth import get_current_user


router = APIRouter(prefix="/entities", tags=["entities"])


class EntityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    """Response for a single entity."""
    id: int
    text: str
    type: str
    count: int
    document_id: int
    file_name: Optional[str] = None




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
    entity_type: Optional[str] = Query(None, pattern="^(PER|ORG|LOC|MISC|DATE)$"),
    search: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
def get_entity_types(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
    entity_type: Optional[str] = Query(None, pattern="^(PER|ORG|LOC|MISC|DATE)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
    entity_type: Optional[str] = Query(None, pattern="^(PER|ORG|LOC|MISC|DATE)$"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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


# ── Graph / Co-occurrence ──────────────────────────────────


class GraphNode(BaseModel):
    """A node in the entity relationship graph."""
    id: str
    text: str
    type: str
    total_count: int
    document_count: int


class GraphEdge(BaseModel):
    """An edge between two co-occurring entities."""
    source: str
    target: str
    weight: int  # Number of shared documents


class GraphResponse(BaseModel):
    """Full graph response for D3 force simulation."""
    nodes: List[GraphNode]
    edges: List[GraphEdge]


@router.get("/graph", response_model=GraphResponse)
def get_entity_graph(
    entity_type: Optional[str] = Query(None, pattern="^(PER|ORG|LOC|MISC|DATE)$"),
    min_count: int = Query(2, ge=1, description="Minimum mentions to include entity"),
    limit: int = Query(60, ge=10, le=200, description="Max number of nodes"),
    project_path: Optional[str] = Query(None, min_length=1, max_length=1024),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Build an entity co-occurrence graph.
    
    Nodes are unique entities; edges connect entities that appear
    in the same document, weighted by the number of shared documents.
    """
    from collections import defaultdict
    from itertools import combinations

    # Step 1: Get top entities by total mentions
    entity_query = db.query(
        Entity.text,
        Entity.type,
        func.sum(Entity.count).label("total_count"),
        func.count(Entity.document_id.distinct()).label("document_count")
    )

    normalized_project_path = project_path.rstrip("/\\") if project_path else None
    if normalized_project_path:
        entity_query = entity_query.join(Document, Document.id == Entity.document_id).filter(
            or_(
                Document.file_path == normalized_project_path,
                Document.file_path.like(f"{normalized_project_path}/%"),
            )
        )

    entity_query = entity_query.group_by(Entity.text, Entity.type)

    if entity_type:
        entity_query = entity_query.filter(Entity.type == entity_type)

    entity_query = entity_query.having(func.sum(Entity.count) >= min_count)
    entity_query = entity_query.order_by(func.sum(Entity.count).desc())
    entity_query = entity_query.limit(limit)

    top_entities = entity_query.all()
    
    if not top_entities:
        return GraphResponse(nodes=[], edges=[])

    # Build node lookup
    entity_keys = set()
    nodes = []
    for e in top_entities:
        key = f"{e.type}:{e.text}"
        entity_keys.add(key)
        nodes.append(GraphNode(
            id=key,
            text=e.text,
            type=e.type,
            total_count=e.total_count,
            document_count=e.document_count
        ))

    # Step 2: Find co-occurrences via shared documents
    # Get all (document_id, entity_key) pairs for our top entities
    entity_pairs = {(e.text, e.type) for e in top_entities}
    
    doc_entities_query = db.query(
        Entity.document_id,
        Entity.text,
        Entity.type
    )

    if normalized_project_path:
        doc_entities_query = doc_entities_query.join(Document, Document.id == Entity.document_id).filter(
            or_(
                Document.file_path == normalized_project_path,
                Document.file_path.like(f"{normalized_project_path}/%"),
            )
        )

    if len(entity_pairs) == 1:
        only_text, only_type = next(iter(entity_pairs))
        doc_entities_query = doc_entities_query.filter(Entity.text == only_text, Entity.type == only_type)
    else:
        doc_entities_query = doc_entities_query.filter(
            tuple_(Entity.text, Entity.type).in_(list(entity_pairs))
        )

    if entity_type:
        doc_entities_query = doc_entities_query.filter(Entity.type == entity_type)

    doc_entities = doc_entities_query.all()

    # Group entities by document
    doc_to_entities: dict[int, set[str]] = defaultdict(set)
    for row in doc_entities:
        key = f"{row.type}:{row.text}"
        if key in entity_keys:
            doc_to_entities[row.document_id].add(key)

    # Count co-occurrences
    edge_weights: dict[tuple[str, str], int] = defaultdict(int)
    for doc_id, ents in doc_to_entities.items():
        if len(ents) < 2:
            continue
        for a, b in combinations(sorted(ents), 2):
            edge_weights[(a, b)] += 1

    # Build edges (only keep meaningful co-occurrences)
    edges = [
        GraphEdge(source=a, target=b, weight=w)
        for (a, b), w in sorted(edge_weights.items(), key=lambda x: -x[1])
        if w >= 1
    ]

    return GraphResponse(nodes=nodes, edges=edges)


# ── Entity Merge ───────────────────────────────────────────


class MergeRequest(BaseModel):
    """Request to merge multiple entity names into a single canonical entity."""
    entities: List[str]
    canonical: str
    entity_type: str


@router.post("/merge")
def merge_entities(
    body: MergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Merge duplicate entities into a canonical entity.

    For each document, consolidate counts: if both "J. Dupont" and
    "Jean Dupont" appear in the same document, keep one row with summed count.
    """
    if body.canonical not in body.entities:
        body.entities.append(body.canonical)

    # Entities to rename (exclude canonical itself)
    aliases = [e for e in body.entities if e != body.canonical]
    if not aliases:
        return {"merged": 0}

    merged_count = 0

    for alias in aliases:
        # Find all rows for this alias
        alias_rows = (
            db.query(Entity)
            .filter(Entity.text == alias, Entity.type == body.entity_type)
            .all()
        )

        for row in alias_rows:
            # Check if canonical already exists in this document
            existing = (
                db.query(Entity)
                .filter(
                    Entity.text == body.canonical,
                    Entity.type == body.entity_type,
                    Entity.document_id == row.document_id,
                )
                .first()
            )

            if existing:
                # Merge counts and delete duplicate
                existing.count += row.count
                db.delete(row)
            else:
                # Just rename
                row.text = body.canonical

            merged_count += 1

    db.commit()
    return {"merged": merged_count, "canonical": body.canonical}
