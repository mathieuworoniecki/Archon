"""
Archon Backend - Qdrant Service
Vector database for semantic search
"""
import math
import uuid
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import Distance, VectorParams, PointStruct
from ..config import get_settings

settings = get_settings()

# Gemini gemini-embedding-001 dimension
EMBEDDING_DIMENSION = 3072


def _cosine_similarity(vec_a: Optional[List[float]], vec_b: Optional[List[float]]) -> float:
    """Cosine similarity with graceful fallback when vectors are missing/invalid."""
    if not vec_a or not vec_b:
        return 0.0
    if len(vec_a) != len(vec_b):
        return 0.0

    dot = 0.0
    norm_a = 0.0
    norm_b = 0.0
    for a, b in zip(vec_a, vec_b):
        dot += a * b
        norm_a += a * a
        norm_b += b * b

    if norm_a <= 0.0 or norm_b <= 0.0:
        return 0.0
    return dot / (math.sqrt(norm_a) * math.sqrt(norm_b))


def _extract_result_vector(result: Any) -> Optional[List[float]]:
    """Extract vector payload from Qdrant search result for MMR reranking."""
    vector = getattr(result, "vector", None)
    if isinstance(vector, list):
        return vector
    if isinstance(vector, dict):
        # Named vectors layout: {"default": [...]}
        for maybe_vec in vector.values():
            if isinstance(maybe_vec, list):
                return maybe_vec
    return None


def mmr_rerank_candidates(
    candidates: List[Dict[str, Any]],
    limit: int,
    lambda_mult: float = 0.72,
) -> List[Dict[str, Any]]:
    """
    Diversify retrieval with Maximal Marginal Relevance (MMR).

    Each candidate must include:
    - score: relevance score
    - _vector: optional embedding vector used for novelty penalty
    """
    if not candidates or limit <= 0:
        return []

    # Work on copies to avoid mutating callers.
    pool = [dict(item) for item in candidates]
    lambda_mult = max(0.0, min(1.0, float(lambda_mult)))

    raw_scores = [float(item.get("score", 0.0)) for item in pool]
    max_score = max(raw_scores)
    min_score = min(raw_scores)
    score_span = max_score - min_score

    for item in pool:
        score = float(item.get("score", 0.0))
        if score_span <= 1e-9:
            item["_relevance"] = 1.0
        else:
            item["_relevance"] = (score - min_score) / score_span

    selected: List[Dict[str, Any]] = []
    while pool and len(selected) < limit:
        if not selected:
            best_idx = max(range(len(pool)), key=lambda i: float(pool[i].get("_relevance", 0.0)))
        else:
            best_idx = 0
            best_mmr = float("-inf")
            for idx, candidate in enumerate(pool):
                relevance = float(candidate.get("_relevance", 0.0))
                novelty_penalty = 0.0
                candidate_vector = candidate.get("_vector")

                if candidate_vector:
                    novelty_penalty = max(
                        _cosine_similarity(candidate_vector, selected_item.get("_vector"))
                        for selected_item in selected
                    )

                mmr = (lambda_mult * relevance) - ((1.0 - lambda_mult) * novelty_penalty)
                if mmr > best_mmr:
                    best_mmr = mmr
                    best_idx = idx

        selected.append(pool.pop(best_idx))

    for item in selected:
        item.pop("_relevance", None)
        item.pop("_vector", None)
    return selected


class QdrantService:
    """Service for interacting with Qdrant vector database."""
    
    def __init__(self):
        self.client = QdrantClient(url=settings.qdrant_url)
        self.collection_name = settings.qdrant_collection
        self._ensure_collection()
    
    def _ensure_collection(self):
        """Ensure the collection exists with proper configuration."""
        collections = self.client.get_collections().collections
        collection_names = [c.name for c in collections]
        
        if self.collection_name not in collection_names:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=EMBEDDING_DIMENSION,
                    distance=Distance.COSINE
                )
            )
            
            # Create payload indexes for filtering
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="document_id",
                field_schema=models.PayloadSchemaType.INTEGER
            )
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="scan_id",
                field_schema=models.PayloadSchemaType.INTEGER
            )
            self.client.create_payload_index(
                collection_name=self.collection_name,
                field_name="file_type",
                field_schema=models.PayloadSchemaType.KEYWORD
            )
    
    def index_chunks(
        self,
        document_id: int,
        scan_id: int,
        file_path: str,
        file_name: str,
        file_type: str,
        chunks: List[Dict[str, Any]],  # [{"text": str, "embedding": List[float], "chunk_index": int}]
    ) -> List[str]:
        """
        Index document chunks with their embeddings.
        
        Returns:
            List of point IDs for the indexed chunks.
        """
        points = []
        point_ids = []
        
        for chunk in chunks:
            point_id = str(uuid.uuid4())
            point_ids.append(point_id)
            
            point = PointStruct(
                id=point_id,
                vector=chunk["embedding"],
                payload={
                    "document_id": document_id,
                    "scan_id": scan_id,
                    "file_path": file_path,
                    "file_name": file_name,
                    "file_type": file_type,
                    "chunk_index": chunk["chunk_index"],
                    "chunk_text": chunk["text"][:1000],  # Store first 1000 chars of chunk
                }
            )
            points.append(point)
        
        if points:
            self.client.upsert(
                collection_name=self.collection_name,
                points=points
            )
        
        return point_ids
    
    def search(
        self,
        query_embedding: List[float],
        limit: int = 20,
        file_types: Optional[List[str]] = None,
        scan_ids: Optional[List[int]] = None,
        use_mmr: bool = True,
        mmr_lambda: float = 0.72,
        candidate_multiplier: int = 12,
        min_score: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """
        Semantic search using query embedding.
        
        Returns:
            List of search results with document info and scores.
        """
        # Build filter conditions
        must_conditions = []
        
        if file_types:
            must_conditions.append(
                models.FieldCondition(
                    key="file_type",
                    match=models.MatchAny(any=file_types)
                )
            )
        
        if scan_ids:
            must_conditions.append(
                models.FieldCondition(
                    key="scan_id",
                    match=models.MatchAny(any=scan_ids)
                )
            )
        
        query_filter = None
        if must_conditions:
            query_filter = models.Filter(must=must_conditions)
        
        candidate_limit = max(limit * max(candidate_multiplier, 2), limit)
        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            query_filter=query_filter,
            limit=candidate_limit,
            with_payload=True,
            with_vectors=use_mmr,
        )
        
        # Deduplicate by document_id, keeping highest score per document
        doc_results = {}
        for result in results:
            payload = result.payload or {}
            doc_id = payload.get("document_id")
            if doc_id is None:
                continue
            score = float(getattr(result, "score", 0.0))
            if min_score is not None and score < float(min_score):
                continue
            if doc_id not in doc_results or result.score > doc_results[doc_id]["score"]:
                doc_results[doc_id] = {
                    "document_id": doc_id,
                    "file_path": payload.get("file_path", ""),
                    "file_name": payload.get("file_name", ""),
                    "file_type": payload.get("file_type", ""),
                    "scan_id": payload.get("scan_id"),
                    "score": score,
                    "chunk_text": payload.get("chunk_text", ""),
                    "chunk_index": payload.get("chunk_index", 0),
                    "_vector": _extract_result_vector(result) if use_mmr else None,
                }
        
        unique_candidates = list(doc_results.values())
        if not unique_candidates:
            return []

        if use_mmr:
            ranked = mmr_rerank_candidates(
                unique_candidates,
                limit=limit,
                lambda_mult=mmr_lambda,
            )
            return ranked

        ranked = sorted(unique_candidates, key=lambda x: x["score"], reverse=True)[:limit]
        for item in ranked:
            item.pop("_vector", None)
        return ranked
    
    def delete_by_document(self, document_id: int) -> int:
        """Delete all vectors for a document."""
        result = self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="document_id",
                            match=models.MatchValue(value=document_id)
                        )
                    ]
                )
            )
        )
        return result.status
    
    def delete_by_scan(self, scan_id: int) -> int:
        """Delete all vectors for a scan."""
        result = self.client.delete(
            collection_name=self.collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="scan_id",
                            match=models.MatchValue(value=scan_id)
                        )
                    ]
                )
            )
        )
        return result.status
    
    def health_check(self) -> bool:
        """Check if Qdrant is healthy."""
        try:
            self.client.get_collections()
            return True
        except Exception:
            return False


# Singleton instance
_qdrant_service: Optional[QdrantService] = None


def get_qdrant_service() -> QdrantService:
    """Get the Qdrant service singleton."""
    global _qdrant_service
    if _qdrant_service is None:
        _qdrant_service = QdrantService()
    return _qdrant_service
