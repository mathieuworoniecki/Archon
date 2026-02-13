// Shared scan record type used by ProjectDashboard and ScansPage
export interface ScanRecord {
    id: number
    path: string
    label?: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    total_files: number
    processed_files: number
    error_count: number
    enable_embeddings?: boolean
    created_at: string
    started_at?: string
    completed_at?: string
}

export interface Scan {
    id: number
    celery_task_id: string | null
    path: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    total_files: number
    processed_files: number
    failed_files: number
    enable_embeddings: boolean
    created_at: string
    started_at: string | null
    completed_at: string | null
    error_message: string | null
    errors: ScanError[]
}

export interface ScanError {
    id: number
    file_path: string
    error_type: string
    error_message: string
    created_at: string
}

export interface ScanProgress {
    scan_id: number
    status: string
    total_files: number
    processed_files: number
    failed_files: number
    current_file: string | null
    progress_percent: number
    phase: string              // idle|detection|processing|indexing|embedding|complete
    files_per_second: number
    eta_seconds: number | null
    elapsed_seconds: number
    type_counts: Record<string, number> | null
    recent_files: string[]
    current_file_type: string | null
    skipped_files: number
    skipped_details: Array<{file: string, reason: string}>
    recent_errors: Array<{file: string, type: string, message: string}>
}

export interface Document {
    id: number
    file_path: string
    file_name: string
    file_type: 'pdf' | 'image' | 'text' | 'video' | 'email' | 'unknown'
    file_size: number
    text_length: number
    has_ocr: boolean
    file_modified_at: string | null
    indexed_at: string
    archive_path?: string | null  // Path inside archive if extracted
}

export interface SearchResult {
    document_id: number
    file_path: string
    file_name: string
    file_type: string
    score: number
    from_meilisearch: boolean
    from_qdrant: boolean
    meilisearch_rank: number | null
    qdrant_rank: number | null
    snippet: string | null
    archive_path?: string | null  // Path inside archive if extracted
    highlights: Array<{
        field: string
        snippet: string
        positions: Array<[number, number]>
    }>
}

export interface SearchResponse {
    query: string
    total_results: number
    results: SearchResult[]
    processing_time_ms: number
}

export interface HealthStatus {
    status: 'healthy' | 'degraded' | string
    services: Record<string, string>
}

export interface DocumentsByType {
    pdf: number
    image: number
    text: number
    video: number
    email?: number
    unknown: number
}

export interface Stats {
    total_documents: number
    documents_by_type: DocumentsByType
    total_scans: number
    last_scan_date: string | null
    index_size_bytes: number
    total_file_size_bytes: number
}

export interface AuditLogEntry {
    id: number
    action: string
    document_id: number | null
    scan_id: number | null
    details: Record<string, unknown> | null
    user_ip: string | null
    entry_hash: string | null
    previous_hash: string | null
    created_at: string
}

export interface AuditTrailDocument {
    id: number
    file_name: string
    file_path: string
    hash_md5: string | null
    hash_sha256: string | null
    indexed_at: string | null
}

export interface AuditTrailResponse {
    document: AuditTrailDocument
    audit_trail: AuditLogEntry[]
}

export interface AuditLogQuery {
    action?: string
    document_id?: number
    scan_id?: number
    limit?: number
    offset?: number
}

export interface WatchlistRule {
    id: number
    name: string
    query: string
    project_path: string | null
    file_types: Array<'pdf' | 'image' | 'text' | 'video' | 'email' | 'unknown'>
    enabled: boolean
    frequency_minutes: number
    last_checked_at: string | null
    last_match_count: number
    last_run_status: string | null
    last_error: string | null
    created_at: string
    updated_at: string
}

export interface WatchlistRunResult {
    rule_id: number
    checked_at: string
    match_count: number
    status: string
    top_document_ids: number[]
    error_message: string | null
}

export interface InvestigationTask {
    id: number
    title: string
    description: string | null
    status: 'todo' | 'in_progress' | 'blocked' | 'done'
    priority: 'low' | 'medium' | 'high' | 'critical'
    due_date: string | null
    project_path: string | null
    document_id: number | null
    assignee_username: string | null
    created_at: string
    updated_at: string
}

export interface ScanEstimate {
    file_count: number
    size_mb: number
    type_counts: {
        pdf: number
        image: number
        text: number
        video: number
    }
    sampled: boolean
    cached: boolean
    embedding_estimate: {
        estimated_tokens: number
        estimated_cost_usd: number
        free_tier_available: boolean
        free_tier_note: string
    }
}

export interface SearchFacets {
    file_types: Array<{ value: string; count: number }>
    size_ranges: Array<{ label: string; min: number; max: number | null; count: number }>
    date_range: { min: string; max: string } | null
    top_entities: Array<{ name: string; type: string; count: number }>
}

// Browse Mode Types
export type FileType = 'pdf' | 'image' | 'text' | 'video' | 'email' | 'unknown'
export type SortBy = 'indexed_desc' | 'indexed_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc' | 'modified_desc' | 'modified_asc'

export interface BrowseFilters {
    skip?: number
    limit?: number
    file_types?: FileType[]
    project_path?: string
    date_from?: string
    date_to?: string
    sort_by?: SortBy
    search?: string
}

export interface DocumentListResponse {
    documents: Document[]
    total: number
    skip: number
    limit: number
}

export interface Tag {
    id: number
    name: string
    color: string
    created_at: string
    favorite_count: number
}

export interface Favorite {
    id: number
    document_id: number
    notes: string | null
    created_at: string
    updated_at: string
    tags: Tag[]
    document?: Document
}

export interface FavoriteListResponse {
    favorites: Favorite[]
    total: number
}

export interface FavoriteStatus {
    document_id: number
    is_favorite: boolean
    favorite_id: number | null
}

export interface DeepAnalysis {
    id: number
    document_id: number
    extractions: string | null    // JSON string
    summary: string | null
    relationships: string | null  // JSON string
    model_used: string | null
    status: 'pending' | 'running' | 'completed' | 'failed'
    error_message: string | null
    processing_time_ms: number | null
    created_at: string
    completed_at: string | null
}

export interface DeepAnalysisExtraction {
    class: string
    text: string
    attributes: Record<string, string>
    start?: number
    end?: number
}

export interface DeepAnalysisRelationship {
    source: string
    target: string
    type: string
    evidence: string
}
