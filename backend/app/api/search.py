"""
Archon Backend - Hybrid Search API Routes
Combines Meilisearch (full-text) and Qdrant (semantic) with Reciprocal Rank Fusion
"""
import time
import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from ..database import get_db
from ..models import Document, DocumentType, Entity, User
from ..schemas import SearchQuery, SearchResult, SearchResponse, SearchHighlight, SearchFacets
from ..services.meilisearch import get_meilisearch_service
from ..services.qdrant import get_qdrant_service
from ..services.embeddings import get_embeddings_service
from ..config import get_settings
from ..utils.auth import get_current_user

settings = get_settings()
router = APIRouter(prefix="/search", tags=["search"])


def reciprocal_rank_fusion(
    meilisearch_results: List[Dict[str, Any]],
    qdrant_results: List[Dict[str, Any]],
    k: int = 60,
    meilisearch_weight: float = 0.5,
    qdrant_weight: float = 0.5,
) -> List[Dict[str, Any]]:
    """
    Combine results using Reciprocal Rank Fusion (RRF).
    
    RRF score = sum of 1 / (k + rank) for each source
    
    Args:
        meilisearch_results: Results from Meilisearch (full-text)
        qdrant_results: Results from Qdrant (semantic)
        k: Constant to avoid high weights for top ranks (default 60)
        meilisearch_weight: Weight of lexical ranking contribution [0, 1]
        qdrant_weight: Weight of semantic ranking contribution [0, 1]
    
    Returns:
        Fused and sorted results
    """
    scores: Dict[int, Dict[str, Any]] = {}
    
    # Score Meilisearch results
    for rank, result in enumerate(meilisearch_results):
        doc_id = result["id"]
        rrf_score = meilisearch_weight * (1 / (k + rank + 1))
        
        if doc_id not in scores:
            scores[doc_id] = {
                "document_id": doc_id,
                "file_path": result["file_path"],
                "file_name": result["file_name"],
                "file_type": result["file_type"],
                "score": 0,
                "from_meilisearch": False,
                "from_qdrant": False,
                "meilisearch_rank": None,
                "qdrant_rank": None,
                "snippet": None,
                "highlights": []
            }
        
        scores[doc_id]["score"] += rrf_score
        scores[doc_id]["from_meilisearch"] = True
        scores[doc_id]["meilisearch_rank"] = rank + 1
        scores[doc_id]["snippet"] = result.get("snippet", "")
        
        # Extract highlights
        if result.get("match_positions"):
            for field, positions in result["match_positions"].items():
                scores[doc_id]["highlights"].append(
                    SearchHighlight(
                        field=field,
                        snippet=result.get("snippet", ""),
                        positions=[(p["start"], p["length"]) for p in positions]
                    )
                )
    
    # Score Qdrant results
    for rank, result in enumerate(qdrant_results):
        doc_id = result["document_id"]
        rrf_score = qdrant_weight * (1 / (k + rank + 1))
        
        if doc_id not in scores:
            scores[doc_id] = {
                "document_id": doc_id,
                "file_path": result["file_path"],
                "file_name": result["file_name"],
                "file_type": result["file_type"],
                "score": 0,
                "from_meilisearch": False,
                "from_qdrant": False,
                "meilisearch_rank": None,
                "qdrant_rank": None,
                "snippet": result.get("chunk_text", ""),
                "highlights": []
            }
        
        scores[doc_id]["score"] += rrf_score
        scores[doc_id]["from_qdrant"] = True
        scores[doc_id]["qdrant_rank"] = rank + 1
        
        # If no snippet from Meilisearch, use Qdrant chunk
        if not scores[doc_id]["snippet"]:
            scores[doc_id]["snippet"] = result.get("chunk_text", "")
    
    # Sort by fused score
    sorted_results = sorted(scores.values(), key=lambda x: x["score"], reverse=True)
    
    return sorted_results


def _rank_score(rank: int, k: int = 60) -> float:
    """Rank-based normalized score aligned with RRF scale."""
    return 1 / (k + rank + 1)


@router.post("/", response_model=SearchResponse)
async def hybrid_search(
    query: SearchQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Perform hybrid search combining full-text and semantic search.
    
    - `semantic_weight = 0`: Pure keyword search (Meilisearch only)
    - `semantic_weight = 1`: Pure semantic search (Qdrant only)
    - `semantic_weight = 0.5`: Balanced hybrid (default)
    """
    start_time = time.time()
    
    meili_service = get_meilisearch_service()
    
    # Convert filters
    file_types = [ft.value for ft in query.file_types] if query.file_types else None
    scan_ids = query.scan_ids
    
    meilisearch_results = []
    qdrant_results = []
    
    # Meilisearch search (if weight < 1)
    if query.semantic_weight < 1:
        try:
            meili_response = meili_service.search(
                query=query.query,
                limit=query.limit * 2,  # Get more for fusion
                offset=0,
                file_types=file_types,
                scan_ids=scan_ids,
                project_path=query.project_path
            )
            meilisearch_results = meili_response.get("hits", [])
        except Exception as e:
            # Log but continue with Qdrant
            logger.error("Meilisearch error: %s", e)
    
    # Qdrant search (if weight > 0 and Gemini key configured)
    if query.semantic_weight > 0 and settings.gemini_api_key:
        try:
            embeddings_service = get_embeddings_service()
            qdrant_service = get_qdrant_service()
            
            # Get query embedding (using retrieval_query task type)
            query_embedding = embeddings_service.get_query_embedding(query.query)
            
            # Search Qdrant
            qdrant_results = qdrant_service.search(
                query_embedding=query_embedding,
                limit=query.limit * 2,
                file_types=file_types,
                scan_ids=scan_ids
            )
        except Exception as e:
            # Log but continue with Meilisearch results
            logger.error("Qdrant error: %s", e)
    
    keyword_weight = max(0.0, min(1.0, 1.0 - float(query.semantic_weight)))
    semantic_weight = max(0.0, min(1.0, float(query.semantic_weight)))

    # Fuse results using weighted RRF
    if meilisearch_results and qdrant_results:
        fused_results = reciprocal_rank_fusion(
            meilisearch_results,
            qdrant_results,
            k=60,
            meilisearch_weight=keyword_weight,
            qdrant_weight=semantic_weight,
        )
    elif meilisearch_results:
        # Only Meilisearch results
        fused_results = [
            {
                "document_id": r["id"],
                "file_path": r["file_path"],
                "file_name": r["file_name"],
                "file_type": r["file_type"],
                "score": keyword_weight * _rank_score(i),
                "from_meilisearch": True,
                "from_qdrant": False,
                "meilisearch_rank": i + 1,
                "qdrant_rank": None,
                "snippet": r.get("snippet", ""),
                "highlights": []
            }
            for i, r in enumerate(meilisearch_results)
        ]
    elif qdrant_results:
        # Only Qdrant results
        fused_results = [
            {
                "document_id": r["document_id"],
                "file_path": r["file_path"],
                "file_name": r["file_name"],
                "file_type": r["file_type"],
                "score": semantic_weight * _rank_score(i),
                "from_meilisearch": False,
                "from_qdrant": True,
                "meilisearch_rank": None,
                "qdrant_rank": i + 1,
                "snippet": r.get("chunk_text", ""),
                "highlights": []
            }
            for i, r in enumerate(qdrant_results)
        ]
    else:
        fused_results = []
    
    # Apply SQL post-filtering for fields not handled by engines
    doc_ids = [r["document_id"] for r in fused_results]
    if doc_ids and (query.size_min is not None or query.size_max is not None
                     or query.date_from or query.date_to or query.entity_names):
        # Build a filter query
        filter_q = db.query(Document.id).filter(Document.id.in_(doc_ids))
        
        if query.size_min is not None:
            filter_q = filter_q.filter(Document.file_size >= query.size_min)
        if query.size_max is not None:
            filter_q = filter_q.filter(Document.file_size <= query.size_max)
        if query.date_from:
            filter_q = filter_q.filter(Document.file_modified_at >= query.date_from)
        if query.date_to:
            filter_q = filter_q.filter(Document.file_modified_at <= query.date_to)
        if query.entity_names:
            filter_q = filter_q.join(Entity).filter(Entity.text.in_(query.entity_names))
        
        valid_ids = {row[0] for row in filter_q.all()}
        fused_results = [r for r in fused_results if r["document_id"] in valid_ids]
    
    # Apply pagination
    paginated_results = fused_results[query.offset:query.offset + query.limit]
    
    # Convert to response model
    results = [
        SearchResult(
            document_id=r["document_id"],
            file_path=r["file_path"],
            file_name=r["file_name"],
            file_type=DocumentType(r["file_type"]) if isinstance(r["file_type"], str) else r["file_type"],
            score=r["score"],
            from_meilisearch=r["from_meilisearch"],
            from_qdrant=r["from_qdrant"],
            meilisearch_rank=r["meilisearch_rank"],
            qdrant_rank=r["qdrant_rank"],
            snippet=r.get("snippet"),
            highlights=r.get("highlights", [])
        )
        for r in paginated_results
    ]
    
    processing_time = (time.time() - start_time) * 1000
    
    return SearchResponse(
        query=query.query,
        total_results=len(fused_results),
        results=results,
        processing_time_ms=processing_time
    )


@router.get("/facets")
async def get_search_facets(
    scan_id: Optional[int] = Query(None, description="Filter facets by scan"),
    project_path: Optional[str] = Query(None, description="Filter facets by project"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get available facet values for search filtering.
    Returns file type counts, size distribution, date range, and top entities.
    """
    from sqlalchemy import func, case
    
    base_q = db.query(Document)
    if scan_id:
        base_q = base_q.filter(Document.scan_id == scan_id)
    if project_path:
        base_q = base_q.filter(Document.file_path.like(f"{project_path}%"))
    
    # File type counts
    type_counts = (
        base_q.with_entities(Document.file_type, func.count(Document.id))
        .group_by(Document.file_type)
        .all()
    )
    file_types = [
        {"value": ft.value if hasattr(ft, 'value') else str(ft), "count": count}
        for ft, count in type_counts
    ]
    
    # Size distribution (single aggregate query instead of N counts)
    MB = 1024 * 1024
    KB100 = 100 * 1024
    MB10 = 10 * MB
    MB100 = 100 * MB

    size_bucket_counts = base_q.with_entities(
        func.sum(case((Document.file_size < KB100, 1), else_=0)).label("lt_100kb"),
        func.sum(case(((Document.file_size >= KB100) & (Document.file_size < MB), 1), else_=0)).label("kb100_to_mb1"),
        func.sum(case(((Document.file_size >= MB) & (Document.file_size < MB10), 1), else_=0)).label("mb1_to_mb10"),
        func.sum(case(((Document.file_size >= MB10) & (Document.file_size < MB100), 1), else_=0)).label("mb10_to_mb100"),
        func.sum(case((Document.file_size >= MB100, 1), else_=0)).label("gte_100mb"),
    ).one()

    size_ranges = []

    for label, min_val, max_val, count in [
        ("< 100 KB", 0, KB100, int(size_bucket_counts.lt_100kb or 0)),
        ("100 KB – 1 MB", KB100, MB, int(size_bucket_counts.kb100_to_mb1 or 0)),
        ("1 – 10 MB", MB, MB10, int(size_bucket_counts.mb1_to_mb10 or 0)),
        ("10 – 100 MB", MB10, MB100, int(size_bucket_counts.mb10_to_mb100 or 0)),
        ("> 100 MB", MB100, None, int(size_bucket_counts.gte_100mb or 0)),
    ]:
        if count > 0:
            size_ranges.append({
                "label": label,
                "min": min_val,
                "max": max_val,
                "count": count
            })
    
    # Date range
    date_min = base_q.with_entities(func.min(Document.file_modified_at)).scalar()
    date_max = base_q.with_entities(func.max(Document.file_modified_at)).scalar()
    date_range = None
    if date_min and date_max:
        date_range = {
            "min": date_min.isoformat(),
            "max": date_max.isoformat()
        }
    
    # Top entities (top 20 by occurrence)
    entity_q = db.query(
        Entity.text,
        Entity.type,
        func.sum(Entity.count).label("total")
    )
    if scan_id:
        entity_q = entity_q.join(Document).filter(Document.scan_id == scan_id)
    if project_path:
        entity_q = entity_q.join(Document).filter(Document.file_path.like(f"{project_path}%"))
    
    top_entities = (
        entity_q
        .group_by(Entity.text, Entity.type)
        .order_by(func.sum(Entity.count).desc())
        .limit(20)
        .all()
    )
    entities = [
        {"name": text, "type": etype, "count": int(total)}
        for text, etype, total in top_entities
    ]
    
    return SearchFacets(
        file_types=file_types,
        size_ranges=size_ranges,
        date_range=date_range,
        top_entities=entities
    )


@router.get("/quick", response_model=SearchResponse)
async def quick_search(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Quick hybrid search with default parameters.
    
    Shorthand for POST /search with default settings.
    """
    query = SearchQuery(query=q, limit=limit)
    return await hybrid_search(query, db)
