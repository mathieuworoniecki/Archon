"""
Archon Backend - Qdrant Service
Vector database for semantic search
"""
import uuid
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.models import Distance, VectorParams, PointStruct
from ..config import get_settings

settings = get_settings()

# Gemini gemini-embedding-001 dimension
EMBEDDING_DIMENSION = 3072


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
        
        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            query_filter=query_filter,
            limit=limit * 2,  # Get more to deduplicate by document
            with_payload=True
        )
        
        # Deduplicate by document_id, keeping highest score per document
        doc_results = {}
        for result in results:
            doc_id = result.payload["document_id"]
            if doc_id not in doc_results or result.score > doc_results[doc_id]["score"]:
                doc_results[doc_id] = {
                    "document_id": doc_id,
                    "file_path": result.payload["file_path"],
                    "file_name": result.payload["file_name"],
                    "file_type": result.payload["file_type"],
                    "scan_id": result.payload["scan_id"],
                    "score": result.score,
                    "chunk_text": result.payload.get("chunk_text", ""),
                    "chunk_index": result.payload.get("chunk_index", 0),
                }
        
        # Sort by score and limit
        sorted_results = sorted(doc_results.values(), key=lambda x: x["score"], reverse=True)
        return sorted_results[:limit]
    
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
