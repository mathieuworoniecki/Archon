"""
War Room Backend - Hybrid Search API Routes
Combines Meilisearch (full-text) and Qdrant (semantic) with Reciprocal Rank Fusion
"""
import time
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Document, DocumentType
from ..schemas import SearchQuery, SearchResult, SearchResponse, SearchHighlight
from ..services.meilisearch import get_meilisearch_service
from ..services.qdrant import get_qdrant_service
from ..services.embeddings import get_embeddings_service
from ..config import get_settings

settings = get_settings()
router = APIRouter(prefix="/search", tags=["search"])


def reciprocal_rank_fusion(
    meilisearch_results: List[Dict[str, Any]],
    qdrant_results: List[Dict[str, Any]],
    k: int = 60
) -> List[Dict[str, Any]]:
    """
    Combine results using Reciprocal Rank Fusion (RRF).
    
    RRF score = sum of 1 / (k + rank) for each source
    
    Args:
        meilisearch_results: Results from Meilisearch (full-text)
        qdrant_results: Results from Qdrant (semantic)
        k: Constant to avoid high weights for top ranks (default 60)
    
    Returns:
        Fused and sorted results
    """
    scores: Dict[int, Dict[str, Any]] = {}
    
    # Score Meilisearch results
    for rank, result in enumerate(meilisearch_results):
        doc_id = result["id"]
        rrf_score = 1 / (k + rank + 1)
        
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
        rrf_score = 1 / (k + rank + 1)
        
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


@router.post("/", response_model=SearchResponse)
async def hybrid_search(
    query: SearchQuery,
    db: Session = Depends(get_db)
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
                scan_ids=scan_ids
            )
            meilisearch_results = meili_response.get("hits", [])
        except Exception as e:
            # Log but continue with Qdrant
            print(f"Meilisearch error: {e}")
    
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
            print(f"Qdrant error: {e}")
    
    # Fuse results using RRF
    if meilisearch_results and qdrant_results:
        # Apply semantic weight to RRF k constant
        # Higher semantic weight = lower k for Qdrant (higher boost)
        fused_results = reciprocal_rank_fusion(
            meilisearch_results,
            qdrant_results,
            k=60
        )
    elif meilisearch_results:
        # Only Meilisearch results
        fused_results = [
            {
                "document_id": r["id"],
                "file_path": r["file_path"],
                "file_name": r["file_name"],
                "file_type": r["file_type"],
                "score": 1 / (60 + i + 1),
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
                "score": r["score"],
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


@router.get("/quick", response_model=SearchResponse)
async def quick_search(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Quick hybrid search with default parameters.
    
    Shorthand for POST /search with default settings.
    """
    query = SearchQuery(query=q, limit=limit)
    return await hybrid_search(query, db)
