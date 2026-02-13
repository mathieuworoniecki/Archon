"""
Archon Backend - Meilisearch Service
Full-text search and highlighting
"""
from dataclasses import dataclass
import meilisearch
from typing import List, Dict, Any, Optional, Literal, Union
from ..config import get_settings

settings = get_settings()


FilterField = Literal["file_type", "scan_id", "file_path"]
FilterOperator = Literal["=", "STARTS WITH"]


@dataclass(frozen=True)
class _FilterClause:
    field: FilterField
    operator: FilterOperator
    value: Union[str, int]


class MeilisearchService:
    """Service for interacting with Meilisearch."""
    _ALLOWED_FILTER_OPERATORS: Dict[str, set[str]] = {
        "file_type": {"="},
        "scan_id": {"="},
        "file_path": {"STARTS WITH"},
    }
    
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
            "filterableAttributes": ["file_type", "scan_id", "file_modified_at", "file_path"],
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
    
    def index_documents_batch(self, documents: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Batch index multiple documents in a single API call (up to 200)."""
        if not documents:
            return {"status": "empty"}
        index = self.client.index(self.index_name)
        task = index.add_documents(documents)
        return {"task_uid": task.task_uid, "status": "enqueued", "count": len(documents)}

    @staticmethod
    def _escape_filter_string(value: str) -> str:
        """Escape a string to keep Meilisearch filter syntax unambiguous."""
        return (
            value.replace("\\", "\\\\")
            .replace('"', '\\"')
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
        )

    @classmethod
    def _build_filter_clause(cls, clause: _FilterClause) -> str:
        """Build and validate one filter clause against whitelisted fields/operators."""
        allowed_operators = cls._ALLOWED_FILTER_OPERATORS.get(clause.field)
        if not allowed_operators:
            raise ValueError(f"Unsupported filter field: {clause.field}")
        if clause.operator not in allowed_operators:
            raise ValueError(
                f"Unsupported operator '{clause.operator}' for field '{clause.field}'"
            )

        if clause.field == "scan_id":
            if isinstance(clause.value, bool) or not isinstance(clause.value, int):
                raise ValueError("scan_ids entries must be integers")
            return f"{clause.field} {clause.operator} {clause.value}"

        if not isinstance(clause.value, str):
            raise ValueError(f"{clause.field} filter value must be a string")

        normalized_value = clause.value.strip()
        if not normalized_value:
            raise ValueError(f"{clause.field} filter value cannot be empty")

        escaped_value = cls._escape_filter_string(normalized_value)
        return f'{clause.field} {clause.operator} "{escaped_value}"'

    @classmethod
    def _build_or_group(cls, clauses: List[_FilterClause]) -> str:
        """Join multiple clauses with OR inside parentheses."""
        if not clauses:
            raise ValueError("Filter group cannot be empty")

        built_clauses = [cls._build_filter_clause(clause) for clause in clauses]
        if len(built_clauses) == 1:
            return built_clauses[0]
        return f"({' OR '.join(built_clauses)})"

    @classmethod
    def _build_filters(
        cls,
        file_types: Optional[List[str]],
        scan_ids: Optional[List[int]],
        project_path: Optional[str],
    ) -> List[str]:
        """Build all Meilisearch filters with strict validation."""
        filters: List[str] = []

        if file_types is not None:
            if not isinstance(file_types, list):
                raise ValueError("file_types must be a list of strings")
            if file_types:
                filters.append(
                    cls._build_or_group(
                        [
                            _FilterClause(field="file_type", operator="=", value=file_type)
                            for file_type in file_types
                        ]
                    )
                )

        if scan_ids is not None:
            if not isinstance(scan_ids, list):
                raise ValueError("scan_ids must be a list of integers")
            if scan_ids:
                filters.append(
                    cls._build_or_group(
                        [_FilterClause(field="scan_id", operator="=", value=scan_id) for scan_id in scan_ids]
                    )
                )

        if project_path is not None:
            if not isinstance(project_path, str):
                raise ValueError("project_path must be a string")
            filters.append(
                cls._build_filter_clause(
                    _FilterClause(
                        field="file_path",
                        operator="STARTS WITH",
                        value=project_path,
                    )
                )
            )

        return filters

    
    def search(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        file_types: Optional[List[str]] = None,
        scan_ids: Optional[List[int]] = None,
        project_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Search documents in Meilisearch with highlighting.
        
        Returns:
            Dict with hits, query, processingTimeMs, and estimatedTotalHits
        """
        index = self.client.index(self.index_name)
        
        filters = self._build_filters(
            file_types=file_types,
            scan_ids=scan_ids,
            project_path=project_path,
        )
        
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
