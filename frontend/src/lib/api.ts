const API_BASE = '/api'

export interface Scan {
    id: number
    celery_task_id: string | null
    path: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    total_files: number
    processed_files: number
    failed_files: number
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
}

export interface Document {
    id: number
    file_path: string
    file_name: string
    file_type: 'pdf' | 'image' | 'text' | 'unknown'
    file_size: number
    text_length: number
    has_ocr: boolean
    file_modified_at: string | null
    indexed_at: string
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
export async function createScan(path: string): Promise<Scan> {
    const response = await fetch(`${API_BASE}/scan/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
    })
    if (!response.ok) throw new Error('Failed to create scan')
    return response.json()
}

export async function getScans(): Promise<Scan[]> {
    const response = await fetch(`${API_BASE}/scan/`)
    if (!response.ok) throw new Error('Failed to fetch scans')
    return response.json()
}

export async function getScan(scanId: number): Promise<Scan> {
    const response = await fetch(`${API_BASE}/scan/${scanId}`)
    if (!response.ok) throw new Error('Failed to fetch scan')
    return response.json()
}

export async function getScanProgress(scanId: number): Promise<ScanProgress> {
    const response = await fetch(`${API_BASE}/scan/${scanId}/progress`)
    if (!response.ok) throw new Error('Failed to fetch scan progress')
    return response.json()
}

export async function cancelScan(scanId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/scan/${scanId}/cancel`, {
        method: 'POST'
    })
    if (!response.ok) throw new Error('Failed to cancel scan')
}

export async function deleteScan(scanId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/scan/${scanId}`, {
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
}): Promise<SearchResponse> {
    const response = await fetch(`${API_BASE}/search/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query,
            limit: options?.limit ?? 20,
            offset: options?.offset ?? 0,
            file_types: options?.file_types,
            scan_ids: options?.scan_ids,
            semantic_weight: options?.semantic_weight ?? 0.5
        })
    })
    if (!response.ok) throw new Error('Search failed')
    return response.json()
}

export async function getDocument(documentId: number): Promise<Document & { text_content: string }> {
    const response = await fetch(`${API_BASE}/documents/${documentId}`)
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
    const response = await fetch(`${API_BASE}/documents/${documentId}/highlights?query=${encodeURIComponent(query)}`)
    if (!response.ok) throw new Error('Failed to fetch highlights')
    return response.json()
}

export function getDocumentFileUrl(documentId: number): string {
    return `${API_BASE}/documents/${documentId}/file`
}

export async function getStats(): Promise<Stats> {
    const response = await fetch(`${API_BASE}/stats/`)
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

    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to fetch documents')
    return response.json()
}

export async function checkHealth(): Promise<HealthStatus> {
    const response = await fetch('/health')
    if (!response.ok) throw new Error('Health check failed')
    return response.json()
}

// WebSocket connection for scan progress
export function connectScanWebSocket(
    scanId: number,
    onMessage: (data: { type: string; data: ScanProgress }) => void,
    onError?: (error: Event) => void
): WebSocket {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const ws = new WebSocket(`${protocol}//${host}/ws/scan/${scanId}`)

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        onMessage(data)
    }

    ws.onerror = (error) => {
        onError?.(error)
    }

    return ws
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
    const response = await fetch(`${API_BASE}/tags/`)
    if (!response.ok) throw new Error('Failed to fetch tags')
    return response.json()
}

export async function createTag(name: string, color: string = '#3b82f6'): Promise<Tag> {
    const response = await fetch(`${API_BASE}/tags/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    })
    if (!response.ok) throw new Error('Failed to create tag')
    return response.json()
}

export async function updateTag(tagId: number, updates: { name?: string; color?: string }): Promise<Tag> {
    const response = await fetch(`${API_BASE}/tags/${tagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    })
    if (!response.ok) throw new Error('Failed to update tag')
    return response.json()
}

export async function deleteTag(tagId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/tags/${tagId}`, { method: 'DELETE' })
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

    const response = await fetch(url)
    if (!response.ok) throw new Error('Failed to fetch favorites')
    return response.json()
}

export async function addFavorite(documentId: number, notes?: string, tagIds?: number[]): Promise<Favorite> {
    const response = await fetch(`${API_BASE}/favorites/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, notes, tag_ids: tagIds })
    })
    if (!response.ok) throw new Error('Failed to add favorite')
    return response.json()
}

export async function updateFavorite(documentId: number, updates: { notes?: string; tag_ids?: number[] }): Promise<Favorite> {
    const response = await fetch(`${API_BASE}/favorites/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    })
    if (!response.ok) throw new Error('Failed to update favorite')
    return response.json()
}

export async function removeFavorite(documentId: number): Promise<void> {
    const response = await fetch(`${API_BASE}/favorites/${documentId}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Failed to remove favorite')
}

export async function checkFavoriteStatus(documentId: number): Promise<FavoriteStatus> {
    const response = await fetch(`${API_BASE}/favorites/check/${documentId}`)
    if (!response.ok) throw new Error('Failed to check favorite status')
    return response.json()
}

