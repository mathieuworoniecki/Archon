"""
War Room Backend - Meilisearch Service
Full-text search and highlighting
"""
import meilisearch
from typing import List, Dict, Any, Optional
from ..config import get_settings

settings = get_settings()


class MeilisearchService:
    """Service for interacting with Meilisearch."""
    
    def __init__(self):
        self.client = meilisearch.Client(
            settings.meilisearch_url,
            settings.meilisearch_api_key or None
        )
        self.index_name = settings.meilisearch_index
        self._ensure_index()
    
    def _ensure_index(self):
        """Ensure the index exists with proper settings."""
        try:
            self.client.get_index(self.index_name)
        except meilisearch.errors.MeilisearchApiError:
            self.client.create_index(self.index_name, {"primaryKey": "id"})
            
        # Configure searchable and filterable attributes
        index = self.client.index(self.index_name)
        index.update_settings({
            "searchableAttributes": ["text_content", "file_name", "file_path"],
            "filterableAttributes": ["file_type", "scan_id", "file_modified_at"],
            "sortableAttributes": ["file_modified_at", "indexed_at", "file_size"],
            "displayedAttributes": ["*"],
        })
    
    def index_document(
        self,
        doc_id: int,
        file_path: str,
        file_name: str,
        file_type: str,
        text_content: str,
        scan_id: int,
        file_modified_at: Optional[str] = None,
        file_size: int = 0,
    ) -> Dict[str, Any]:
        """Index a document in Meilisearch."""
        index = self.client.index(self.index_name)
        
        document = {
            "id": str(doc_id),
            "file_path": file_path,
            "file_name": file_name,
            "file_type": file_type,
            "text_content": text_content,
            "scan_id": scan_id,
            "file_modified_at": file_modified_at,
            "file_size": file_size,
        }
        
        task = index.add_documents([document])
        return {"task_uid": task.task_uid, "status": "enqueued"}
    
    def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        file_types: Optional[List[str]] = None,
        scan_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Search documents in Meilisearch with highlighting.
        
        Returns:
            Dict with hits, query, processingTimeMs, and estimatedTotalHits
        """
        index = self.client.index(self.index_name)
        
        # Build filters
        filters = []
        if file_types:
            type_filter = " OR ".join([f'file_type = "{t}"' for t in file_types])
            filters.append(f"({type_filter})")
        if scan_ids:
            scan_filter = " OR ".join([f"scan_id = {s}" for s in scan_ids])
            filters.append(f"({scan_filter})")
        
        search_params = {
            "limit": limit,
            "offset": offset,
            "attributesToHighlight": ["text_content", "file_name"],
            "highlightPreTag": "<mark>",
            "highlightPostTag": "</mark>",
            "attributesToCrop": ["text_content"],
            "cropLength": 200,
            "showMatchesPosition": True,
        }
        
        if filters:
            search_params["filter"] = " AND ".join(filters)
        
        results = index.search(query, search_params)
        
        # Transform results to include snippet
        transformed_hits = []
        for hit in results.get("hits", []):
            formatted = hit.get("_formatted", {})
            transformed_hit = {
                "id": int(hit["id"]),
                "file_path": hit["file_path"],
                "file_name": hit["file_name"],
                "file_type": hit["file_type"],
                "scan_id": hit["scan_id"],
                "snippet": formatted.get("text_content", ""),
                "highlighted_name": formatted.get("file_name", hit["file_name"]),
                "match_positions": hit.get("_matchesPosition", {}),
            }
            transformed_hits.append(transformed_hit)
        
        return {
            "hits": transformed_hits,
            "query": query,
            "processingTimeMs": results.get("processingTimeMs", 0),
            "estimatedTotalHits": results.get("estimatedTotalHits", 0),
        }
    
    def delete_document(self, doc_id: int) -> Dict[str, Any]:
        """Delete a document from the index."""
        index = self.client.index(self.index_name)
        task = index.delete_document(str(doc_id))
        return {"task_uid": task.task_uid, "status": "enqueued"}
    
    def delete_by_scan(self, scan_id: int) -> Dict[str, Any]:
        """Delete all documents from a scan."""
        index = self.client.index(self.index_name)
        task = index.delete_documents_by_filter(f"scan_id = {scan_id}")
        return {"task_uid": task.task_uid, "status": "enqueued"}
    
    def health_check(self) -> bool:
        """Check if Meilisearch is healthy."""
        try:
            self.client.health()
            return True
        except Exception:
            return False


# Singleton instance
_meilisearch_service: Optional[MeilisearchService] = None


def get_meilisearch_service() -> MeilisearchService:
    """Get the Meilisearch service singleton."""
    global _meilisearch_service
    if _meilisearch_service is None:
        _meilisearch_service = MeilisearchService()
    return _meilisearch_service
