"""
Archon Backend - Pydantic Schemas
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .models import ScanStatus, DocumentType


def _strip_string(value):
    if isinstance(value, str):
        return value.strip()
    return value


def _strip_or_none(value):
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


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
    # Phase tracking
    phase: str = "idle"  # idle|detection|processing|indexing|embedding|complete
    # Performance metrics
    files_per_second: float = 0.0
    eta_seconds: Optional[int] = None
    elapsed_seconds: int = 0
    # File type breakdown
    type_counts: Optional[dict] = None  # {"pdf": 42, "image": 120, ...}
    # Activity feed
    recent_files: List[str] = []  # Last 5 processed file names
    current_file_type: Optional[str] = None
    # Incremental scan info
    skipped_files: int = 0


class ScanErrorOut(BaseModel):
    """Schema for scan errors."""
    id: int
    file_path: str
    error_type: str
    error_message: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ScanOut(BaseModel):
    """Schema for scan output."""
    id: int
    celery_task_id: Optional[str]
    path: str
    label: Optional[str] = None
    status: ScanStatus
    total_files: int
    processed_files: int
    failed_files: int
    enable_embeddings: bool = False
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    errors: List[ScanErrorOut] = []
    
    model_config = ConfigDict(from_attributes=True)


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
    redaction_status: Optional[str] = None  # none, suspected, confirmed
    redaction_score: Optional[float] = None  # 0.0–1.0
    
    model_config = ConfigDict(from_attributes=True)


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


class DocumentContentResponse(BaseModel):
    """Schema for document text content response."""
    document_id: int
    file_name: str
    text_content: Optional[str]
    text_length: int


class DocumentHighlightMatch(BaseModel):
    """Schema for a query match inside a document."""
    position: int
    length: int
    context: str
    context_start: int


class DocumentHighlightsResponse(BaseModel):
    """Schema for document highlights response."""
    document_id: int
    query: str
    total_matches: int
    matches: List[DocumentHighlightMatch]


class DocumentDeleteResponse(BaseModel):
    """Schema for document deletion response."""
    status: str
    document_id: int


class DocumentRedactionResponse(BaseModel):
    """Schema for document redaction response."""
    document_id: int
    redaction_status: Optional[str]
    redaction_score: Optional[float]


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
    project_path: Optional[str] = Field(None, description="Filter by project path prefix")
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    size_min: Optional[int] = Field(None, ge=0, description="Minimum file size in bytes")
    size_max: Optional[int] = Field(None, ge=0, description="Maximum file size in bytes")
    entity_names: Optional[List[str]] = Field(None, description="Filter by entity names (NER)")
    
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


class SearchFacets(BaseModel):
    """Available facet values for filtering."""
    file_types: List[dict] = []   # [{"value": "PDF", "count": 42}]
    size_ranges: List[dict] = []  # [{"label": "< 1 MB", "min": 0, "max": 1048576, "count": 10}]
    date_range: Optional[dict] = None  # {"min": "2020-01-01", "max": "2024-12-31"}
    top_entities: List[dict] = []  # [{"name": "John Doe", "type": "PERSON", "count": 15}]


class SearchResponse(BaseModel):
    """Schema for search response."""
    query: str
    total_results: int
    results: List[SearchResult]
    processing_time_ms: float
    facets: Optional[SearchFacets] = None


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
    video: int = 0
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
    
    model_config = ConfigDict(from_attributes=True)


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
    
    model_config = ConfigDict(from_attributes=True)


class FavoriteListResponse(BaseModel):
    """Schema for paginated favorite list."""
    favorites: List[FavoriteOut]
    total: int


# =============================================================================
# WATCHLIST SCHEMAS
# =============================================================================

class WatchlistRuleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    query: str = Field(..., min_length=1, max_length=512)
    project_path: Optional[str] = Field(default=None, max_length=1024)
    file_types: Optional[List[DocumentType]] = None
    enabled: bool = True
    frequency_minutes: int = Field(default=60, ge=1, le=10080)

    @field_validator("name", "query", mode="before")
    @classmethod
    def _normalize_required_fields(cls, value):
        return _strip_string(value)

    @field_validator("project_path", mode="before")
    @classmethod
    def _normalize_project_path(cls, value):
        return _strip_or_none(value)


class WatchlistRuleCreate(WatchlistRuleBase):
    pass


class WatchlistRuleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    query: Optional[str] = Field(default=None, min_length=1, max_length=512)
    project_path: Optional[str] = Field(default=None, max_length=1024)
    file_types: Optional[List[DocumentType]] = None
    enabled: Optional[bool] = None
    frequency_minutes: Optional[int] = Field(default=None, ge=1, le=10080)

    @field_validator("name", "query", mode="before")
    @classmethod
    def _normalize_required_fields(cls, value):
        return _strip_string(value)

    @field_validator("project_path", mode="before")
    @classmethod
    def _normalize_project_path(cls, value):
        return _strip_or_none(value)


class WatchlistRuleOut(BaseModel):
    id: int
    name: str
    query: str
    project_path: Optional[str]
    file_types: List[DocumentType] = []
    enabled: bool
    frequency_minutes: int
    last_checked_at: Optional[datetime]
    last_match_count: int
    last_run_status: Optional[str]
    last_error: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WatchlistRunResult(BaseModel):
    rule_id: int
    checked_at: datetime
    match_count: int
    status: str
    top_document_ids: List[int] = []
    error_message: Optional[str] = None


# =============================================================================
# INVESTIGATION TASK SCHEMAS
# =============================================================================

class InvestigationTaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = Field(default="todo", pattern="^(todo|in_progress|blocked|done)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    due_date: Optional[datetime] = None
    project_path: Optional[str] = Field(default=None, max_length=1024)
    document_id: Optional[int] = Field(default=None, ge=1)
    assignee_username: Optional[str] = Field(default=None, max_length=100)

    @field_validator("title", mode="before")
    @classmethod
    def _normalize_title(cls, value):
        return _strip_string(value)

    @field_validator("project_path", "assignee_username", mode="before")
    @classmethod
    def _normalize_optional_fields(cls, value):
        return _strip_or_none(value)


class InvestigationTaskCreate(InvestigationTaskBase):
    pass


class InvestigationTaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(todo|in_progress|blocked|done)$")
    priority: Optional[str] = Field(default=None, pattern="^(low|medium|high|critical)$")
    due_date: Optional[datetime] = None
    project_path: Optional[str] = Field(default=None, max_length=1024)
    document_id: Optional[int] = Field(default=None, ge=1)
    assignee_username: Optional[str] = Field(default=None, max_length=100)

    @field_validator("title", mode="before")
    @classmethod
    def _normalize_title(cls, value):
        return _strip_string(value)

    @field_validator("project_path", "assignee_username", mode="before")
    @classmethod
    def _normalize_optional_fields(cls, value):
        return _strip_or_none(value)


class InvestigationTaskOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: str
    priority: str
    due_date: Optional[datetime]
    project_path: Optional[str]
    document_id: Optional[int]
    assignee_username: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# DEEP ANALYSIS SCHEMAS (LangExtract)
# =============================================================================

class DeepAnalysisOut(BaseModel):
    """Schema for deep analysis output."""
    id: int
    document_id: int
    extractions: Optional[str] = None      # JSON string
    summary: Optional[str] = None
    relationships: Optional[str] = None    # JSON string
    model_used: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    processing_time_ms: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DeepAnalysisBatchRequest(BaseModel):
    """Schema for batch deep analysis request."""
    document_ids: List[int] = Field(..., min_length=1, max_length=50)
