"""
War Room Backend - Pydantic Schemas
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from .models import ScanStatus, DocumentType


# =============================================================================
# SCAN SCHEMAS
# =============================================================================

class ScanCreate(BaseModel):
    """Schema for creating a new scan."""
    path: str = Field(..., description="Path to the directory to scan")
    enable_embeddings: bool = Field(
        default=False, 
        description="Enable semantic embeddings (requires Gemini API, costs ~0.001$/1000 docs)"
    )


class ScanProgress(BaseModel):
    """Schema for scan progress updates."""
    scan_id: int
    status: ScanStatus
    total_files: int
    processed_files: int
    failed_files: int
    current_file: Optional[str] = None
    progress_percent: float = 0.0


class ScanErrorOut(BaseModel):
    """Schema for scan errors."""
    id: int
    file_path: str
    error_type: str
    error_message: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class ScanOut(BaseModel):
    """Schema for scan output."""
    id: int
    celery_task_id: Optional[str]
    path: str
    status: ScanStatus
    total_files: int
    processed_files: int
    failed_files: int
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    errors: List[ScanErrorOut] = []
    
    class Config:
        from_attributes = True


# =============================================================================
# DOCUMENT SCHEMAS
# =============================================================================

class DocumentOut(BaseModel):
    """Schema for document output."""
    id: int
    file_path: str
    file_name: str
    file_type: DocumentType
    file_size: int
    text_length: int
    has_ocr: bool
    file_modified_at: Optional[datetime]
    indexed_at: datetime
    archive_path: Optional[str] = None  # Path inside archive if extracted
    
    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    """Schema for paginated document list response."""
    documents: List[DocumentOut]
    total: int
    skip: int
    limit: int


class DocumentDetail(DocumentOut):
    """Schema for document detail with content."""
    text_content: Optional[str]
    scan_id: int


# =============================================================================
# SEARCH SCHEMAS
# =============================================================================

class SearchQuery(BaseModel):
    """Schema for search queries."""
    query: str = Field(..., min_length=1, description="Search query")
    limit: int = Field(20, ge=1, le=100, description="Max results to return")
    offset: int = Field(0, ge=0, description="Offset for pagination")
    
    # Filters
    file_types: Optional[List[DocumentType]] = None
    scan_ids: Optional[List[int]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    
    # Search mode
    semantic_weight: float = Field(0.5, ge=0, le=1, description="Weight for semantic search (0=keyword only, 1=semantic only)")


class SearchHighlight(BaseModel):
    """Schema for search highlight."""
    field: str
    snippet: str
    positions: List[tuple[int, int]] = []


class SearchResult(BaseModel):
    """Schema for a single search result."""
    document_id: int
    file_path: str
    file_name: str
    file_type: DocumentType
    score: float
    highlights: List[SearchHighlight] = []
    snippet: Optional[str] = None
    archive_path: Optional[str] = None  # Path inside archive if extracted
    
    # Source tracking
    from_meilisearch: bool = False
    from_qdrant: bool = False
    meilisearch_rank: Optional[int] = None
    qdrant_rank: Optional[int] = None


class SearchResponse(BaseModel):
    """Schema for search response."""
    query: str
    total_results: int
    results: List[SearchResult]
    processing_time_ms: float


# =============================================================================
# WEBSOCKET SCHEMAS
# =============================================================================

# =============================================================================
# STATS SCHEMAS
# =============================================================================

class DocumentsByType(BaseModel):
    """Schema for document count by type."""
    pdf: int = 0
    image: int = 0
    text: int = 0
    unknown: int = 0


class StatsResponse(BaseModel):
    """Schema for global stats response."""
    total_documents: int
    documents_by_type: DocumentsByType
    total_scans: int
    last_scan_date: Optional[datetime] = None
    index_size_bytes: int = 0
    total_file_size_bytes: int = 0


# =============================================================================
# WEBSOCKET SCHEMAS
# =============================================================================

class WSMessage(BaseModel):
    """Schema for WebSocket messages."""
    type: str  # "progress", "error", "complete"
    data: dict


# =============================================================================
# TAG SCHEMAS
# =============================================================================

class TagBase(BaseModel):
    """Base schema for tags."""
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#3b82f6", pattern=r"^#[0-9a-fA-F]{6}$")


class TagCreate(TagBase):
    """Schema for creating a tag."""
    pass


class TagOut(TagBase):
    """Schema for tag output."""
    id: int
    created_at: datetime
    favorite_count: int = 0
    
    class Config:
        from_attributes = True


class TagUpdate(BaseModel):
    """Schema for updating a tag."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")


# =============================================================================
# FAVORITE SCHEMAS
# =============================================================================

class FavoriteCreate(BaseModel):
    """Schema for creating a favorite."""
    document_id: int
    notes: Optional[str] = None
    tag_ids: Optional[List[int]] = None


class FavoriteUpdate(BaseModel):
    """Schema for updating a favorite."""
    notes: Optional[str] = None
    tag_ids: Optional[List[int]] = None


class FavoriteOut(BaseModel):
    """Schema for favorite output."""
    id: int
    document_id: int
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    tags: List[TagOut] = []
    document: Optional[DocumentOut] = None
    
    class Config:
        from_attributes = True


class FavoriteListResponse(BaseModel):
    """Schema for paginated favorite list."""
    favorites: List[FavoriteOut]
    total: int

