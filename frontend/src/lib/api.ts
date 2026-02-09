import { authFetch } from './auth'

export const API_BASE = '/api'

// Use authFetch for all API calls (injects JWT Bearer token)
const apiFetch = authFetch

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
    file_type: 'pdf' | 'image' | 'text' | 'video' | 'unknown'
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
    status: string
    services: {
        meilisearch: boolean
        qdrant: boolean
        redis: boolean
    }
}

export interface DocumentsByType {
    pdf: number
    image: number
    text: number
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

// API Functions

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

export async function estimateScan(path: string): Promise<ScanEstimate> {
    const response = await apiFetch(`${API_BASE}/scan/estimate?path=${encodeURIComponent(path)}`, {
        method: 'POST',
    })
    if (!response.ok) throw new Error('Failed to estimate scan')
    return response.json()
}

export async function createScan(path: string, enableEmbeddings: boolean = false): Promise<Scan> {
    const response = await apiFetch(`${API_BASE}/scan/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, enable_embeddings: enableEmbeddings })
    })
    if (!response.ok) throw new Error('Failed to create scan')
    return response.json()
}

export async function getScans(): Promise<Scan[]> {
    const response = await apiFetch(`${API_BASE}/scan/`)
    if (!response.ok) throw new Error('Failed to fetch scans')
    return response.json()
}

export async function getScan(scanId: number): Promise<Scan> {
    const response = await apiFetch(`${API_BASE}/scan/${scanId}`)
    if (!response.ok) throw new Error('Failed to fetch scan')
    return response.json()
}

export async function getScanProgress(scanId: number): Promise<ScanProgress> {
    const response = await apiFetch(`${API_BASE}/scan/${scanId}/progress`)
    if (!response.ok) throw new Error('Failed to fetch scan progress')
    return response.json()
}

export async function cancelScan(scanId: number): Promise<void> {
    const response = await apiFetch(`${API_BASE}/scan/${scanId}/cancel`, {
        method: 'POST'
    })
    if (!response.ok) throw new Error('Failed to cancel scan')
}

export async function resumeScan(scanId: number): Promise<Scan> {
    const response = await apiFetch(`${API_BASE}/scan/${scanId}/resume`, {
        method: 'POST'
    })
    if (!response.ok) throw new Error('Failed to resume scan')
    return response.json()
}

export async function deleteScan(scanId: number): Promise<void> {
    const response = await apiFetch(`${API_BASE}/scan/${scanId}`, {
        method: 'DELETE'
    })
    if (!response.ok) throw new Error('Failed to delete scan')
}

export async function search(query: string, options?: {
    limit?: number
    offset?: number
    file_types?: string[]
    scan_ids?: number[]
    semantic_weight?: number
    project_path?: string
}): Promise<SearchResponse> {
    const response = await apiFetch(`${API_BASE}/search/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            limit: options?.limit ?? 20,
            offset: options?.offset ?? 0,
            file_types: options?.file_types,
            scan_ids: options?.scan_ids,
            semantic_weight: options?.semantic_weight ?? 0.5,
            project_path: options?.project_path
        })
    })
    if (!response.ok) throw new Error('Search failed')
    return response.json()
}

export async function getDocument(documentId: number): Promise<Document & { text_content: string }> {
    const response = await apiFetch(`${API_BASE}/documents/${documentId}`)
    if (!response.ok) throw new Error('Failed to fetch document')
    return response.json()
}

export async function getDocumentHighlights(documentId: number, query: string): Promise<{
    document_id: number
    query: string
    total_matches: number
    matches: Array<{
        position: number
        length: number
        context: string
        context_start: number
    }>
}> {
    const response = await apiFetch(`${API_BASE}/documents/${documentId}/highlights?query=${encodeURIComponent(query)}`)
    if (!response.ok) throw new Error('Failed to fetch highlights')
    return response.json()
}

export function getDocumentFileUrl(documentId: number): string {
    return `${API_BASE}/documents/${documentId}/file`
}

export async function getStats(): Promise<Stats> {
    const response = await apiFetch(`${API_BASE}/stats/`)
    if (!response.ok) throw new Error('Failed to fetch stats')
    return response.json()
}

// Browse Mode Types
export type FileType = 'pdf' | 'image' | 'text' | 'unknown'
export type SortBy = 'indexed_desc' | 'indexed_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc' | 'modified_desc' | 'modified_asc'

export interface BrowseFilters {
    skip?: number
    limit?: number
    file_types?: FileType[]
    date_from?: string
    date_to?: string
    sort_by?: SortBy
}

export interface DocumentListResponse {
    documents: Document[]
    total: number
    skip: number
    limit: number
}

export async function getDocuments(filters?: BrowseFilters): Promise<DocumentListResponse> {
    const params = new URLSearchParams()

    if (filters?.skip !== undefined) params.append('skip', String(filters.skip))
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit))
    if (filters?.file_types) {
        filters.file_types.forEach(t => params.append('file_types', t))
    }
    if (filters?.date_from) params.append('date_from', filters.date_from)
    if (filters?.date_to) params.append('date_to', filters.date_to)
    if (filters?.sort_by) params.append('sort_by', filters.sort_by)

    const queryString = params.toString()
    const url = `${API_BASE}/documents/${queryString ? '?' + queryString : ''}`

    const response = await apiFetch(url)
    if (!response.ok) throw new Error('Failed to fetch documents')
    return response.json()
}

export async function checkHealth(): Promise<HealthStatus> {
    const response = await apiFetch('/health')
    if (!response.ok) throw new Error('Health check failed')
    return response.json()
}

// SSE connection for real-time scan progress with auto-reconnect
export function connectScanStream(
    scanId: number,
    onProgress: (data: ScanProgress) => void,
    onComplete?: () => void,
    onError?: (error: Event) => void,
    onReconnecting?: (attempt: number) => void
): { close: () => void } {
    let closed = false
    let retryCount = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let currentSource: EventSource | null = null
    const MAX_RETRIES = 10
    const BASE_DELAY = 1000
    const MAX_DELAY = 30000

    function connect() {
        if (closed) return
        const eventSource = new EventSource(`${API_BASE}/scan/${scanId}/stream`)
        currentSource = eventSource

        eventSource.addEventListener('progress', (event: MessageEvent) => {
            try {
                retryCount = 0 // Reset on successful data
                const data = JSON.parse(event.data) as ScanProgress
                onProgress(data)
            } catch (e) {
                console.error('Failed to parse SSE progress:', e)
            }
        })

        eventSource.addEventListener('complete', (event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data) as ScanProgress
                onProgress(data)
                closed = true
                eventSource.close()
                onComplete?.()
            } catch (e) {
                console.error('Failed to parse SSE complete:', e)
            }
        })

        eventSource.addEventListener('error', (event: MessageEvent) => {
            eventSource.close()
            if (closed) return

            // Check if it's a server-sent error event with data
            if (event.data) {
                console.error('SSE server error:', event.data)
                onError?.(event as unknown as Event)
                return
            }

            // Connection lost — attempt reconnect
            retryCount++
            if (retryCount > MAX_RETRIES) {
                console.error(`SSE: max retries (${MAX_RETRIES}) reached, giving up`)
                onError?.(event as unknown as Event)
                return
            }

            const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount - 1), MAX_DELAY)
            console.warn(`SSE: reconnecting in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`)
            onReconnecting?.(retryCount)
            retryTimer = setTimeout(connect, delay)
        })
    }

    connect()

    return {
        close: () => {
            closed = true
            if (retryTimer) clearTimeout(retryTimer)
            currentSource?.close()
        }
    }
}

// Legacy WebSocket function (deprecated, use connectScanStream instead)
export function connectScanWebSocket(
    scanId: number,
    onMessage: (data: { type: string; data: ScanProgress }) => void,
    onError?: (error: Event) => void
): { close: () => void } {
    // Use SSE internally for compatibility
    return connectScanStream(
        scanId,
        (progress) => onMessage({ type: 'progress', data: progress }),
        () => onMessage({ type: 'complete', data: {} as ScanProgress }),
        onError
    )
}

// =============================================================================
// FAVORITES & TAGS API
// =============================================================================

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

// Tags API
export async function getTags(): Promise<Tag[]> {
    const response = await apiFetch(`${API_BASE}/tags/`)
    if (!response.ok) throw new Error('Failed to fetch tags')
    return response.json()
}

export async function createTag(name: string, color: string = '#3b82f6'): Promise<Tag> {
    const response = await apiFetch(`${API_BASE}/tags/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    })
    if (!response.ok) throw new Error('Failed to create tag')
    return response.json()
}

export async function updateTag(tagId: number, updates: { name?: string; color?: string }): Promise<Tag> {
    const response = await apiFetch(`${API_BASE}/tags/${tagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    })
    if (!response.ok) throw new Error('Failed to update tag')
    return response.json()
}

export async function deleteTag(tagId: number): Promise<void> {
    const response = await apiFetch(`${API_BASE}/tags/${tagId}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Failed to delete tag')
}

// Favorites API
export async function getFavorites(tagIds?: number[]): Promise<FavoriteListResponse> {
    const params = new URLSearchParams()
    if (tagIds) {
        tagIds.forEach(id => params.append('tag_ids', String(id)))
    }
    const queryString = params.toString()
    const url = `${API_BASE}/favorites/${queryString ? '?' + queryString : ''}`

    const response = await apiFetch(url)
    if (!response.ok) throw new Error('Failed to fetch favorites')
    return response.json()
}

export async function addFavorite(documentId: number, notes?: string, tagIds?: number[]): Promise<Favorite> {
    const response = await apiFetch(`${API_BASE}/favorites/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, notes, tag_ids: tagIds })
    })
    if (!response.ok) throw new Error('Failed to add favorite')
    return response.json()
}

export async function updateFavorite(documentId: number, updates: { notes?: string; tag_ids?: number[] }): Promise<Favorite> {
    const response = await apiFetch(`${API_BASE}/favorites/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    })
    if (!response.ok) throw new Error('Failed to update favorite')
    return response.json()
}

export async function removeFavorite(documentId: number): Promise<void> {
    const response = await apiFetch(`${API_BASE}/favorites/${documentId}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Failed to remove favorite')
}

export async function checkFavoriteStatus(documentId: number): Promise<FavoriteStatus> {
    const response = await apiFetch(`${API_BASE}/favorites/check/${documentId}`)
    if (!response.ok) throw new Error('Failed to check favorite status')
    return response.json()
}

// Factory reset - delete ALL data
export async function factoryReset(): Promise<{ deleted_scans: number; deleted_documents: number }> {
    const response = await apiFetch(`${API_BASE}/scan/factory-reset`, {
        method: 'POST'
    })
    if (!response.ok) throw new Error('Failed to factory reset')
    return response.json()
}
