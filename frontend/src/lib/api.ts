import { authFetch } from './auth'

export const API_BASE = '/api'

// Use authFetch for all API calls (injects JWT Bearer token)
const apiFetch = authFetch

interface APIErrorPayload {
    code?: string
    message?: string
    detail?: string
    request_id?: string
    details?: unknown
}

export class APIError extends Error {
    status: number
    code?: string
    requestId?: string
    details?: unknown

    constructor(message: string, status: number, code?: string, requestId?: string, details?: unknown) {
        super(message)
        this.name = 'APIError'
        this.status = status
        this.code = code
        this.requestId = requestId
        this.details = details
    }
}

async function buildAPIError(response: Response, fallbackMessage: string): Promise<APIError> {
    let payload: APIErrorPayload | null = null
    try {
        payload = await response.clone().json() as APIErrorPayload
    } catch {
        payload = null
    }

    const message = (
        (payload && typeof payload.message === 'string' && payload.message) ||
        (payload && typeof payload.detail === 'string' && payload.detail) ||
        fallbackMessage
    )
    const code = payload && typeof payload.code === 'string' ? payload.code : undefined
    const requestId = (
        payload && typeof payload.request_id === 'string'
            ? payload.request_id
            : response.headers.get('X-Request-Id') || undefined
    )
    const details = payload && Object.prototype.hasOwnProperty.call(payload, 'details')
        ? payload.details
        : undefined

    return new APIError(message, response.status, code, requestId, details)
}

async function ensureOk(response: Response, fallbackMessage: string): Promise<void> {
    if (response.ok) return
    throw await buildAPIError(response, fallbackMessage)
}

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
    await ensureOk(response, 'Failed to estimate scan')
    return response.json()
}

export async function fetchAuditLogs(params: AuditLogQuery = {}): Promise<AuditLogEntry[]> {
    const query = new URLSearchParams()
    if (params.action) query.set('action', params.action)
    if (params.document_id !== undefined) query.set('document_id', String(params.document_id))
    if (params.scan_id !== undefined) query.set('scan_id', String(params.scan_id))
    if (params.limit !== undefined) query.set('limit', String(params.limit))
    if (params.offset !== undefined) query.set('offset', String(params.offset))

    const qs = query.toString()
    const response = await apiFetch(`${API_BASE}/audit/${qs ? `?${qs}` : ''}`)
    await ensureOk(response, 'Failed to fetch audit logs')
    return response.json()
}

export async function fetchDocumentAuditTrail(documentId: number): Promise<AuditTrailResponse> {
    const response = await apiFetch(`${API_BASE}/audit/document/${documentId}`)
    await ensureOk(response, 'Failed to fetch document audit trail')
    return response.json()
}

export async function listWatchlistRules(enabled?: boolean): Promise<WatchlistRule[]> {
    const query = new URLSearchParams()
    if (enabled !== undefined) query.set('enabled', String(enabled))
    const qs = query.toString()
    const response = await apiFetch(`${API_BASE}/watchlist/${qs ? `?${qs}` : ''}`)
    await ensureOk(response, 'Failed to list watchlist rules')
    return response.json()
}

export async function createWatchlistRule(payload: {
    name: string
    query: string
    project_path?: string
    file_types?: string[]
    enabled?: boolean
    frequency_minutes?: number
}): Promise<WatchlistRule> {
    const response = await apiFetch(`${API_BASE}/watchlist/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    await ensureOk(response, 'Failed to create watchlist rule')
    return response.json()
}

export async function updateWatchlistRule(ruleId: number, payload: Partial<{
    name: string
    query: string
    project_path: string
    file_types: string[]
    enabled: boolean
    frequency_minutes: number
}>): Promise<WatchlistRule> {
    const response = await apiFetch(`${API_BASE}/watchlist/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    await ensureOk(response, 'Failed to update watchlist rule')
    return response.json()
}

export async function deleteWatchlistRule(ruleId: number): Promise<void> {
    const response = await apiFetch(`${API_BASE}/watchlist/${ruleId}`, { method: 'DELETE' })
    await ensureOk(response, 'Failed to delete watchlist rule')
}

export async function runWatchlistRule(ruleId: number): Promise<WatchlistRunResult> {
    const response = await apiFetch(`${API_BASE}/watchlist/${ruleId}/run`, { method: 'POST' })
    await ensureOk(response, 'Failed to run watchlist rule')
    return response.json()
}

export async function listInvestigationTasks(params: Partial<{
    status: string
    priority: string
    project_path: string
    document_id: number
    assignee_username: string
    limit: number
}> = {}): Promise<InvestigationTask[]> {
    const query = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') query.set(k, String(v))
    })
    const qs = query.toString()
    const response = await apiFetch(`${API_BASE}/tasks/${qs ? `?${qs}` : ''}`)
    await ensureOk(response, 'Failed to list tasks')
    return response.json()
}

export async function createInvestigationTask(payload: {
    title: string
    description?: string
    status?: 'todo' | 'in_progress' | 'blocked' | 'done'
    priority?: 'low' | 'medium' | 'high' | 'critical'
    due_date?: string
    project_path?: string
    document_id?: number
    assignee_username?: string
}): Promise<InvestigationTask> {
    const response = await apiFetch(`${API_BASE}/tasks/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    await ensureOk(response, 'Failed to create task')
    return response.json()
}

export async function updateInvestigationTask(taskId: number, payload: Partial<{
    title: string
    description: string
    status: 'todo' | 'in_progress' | 'blocked' | 'done'
    priority: 'low' | 'medium' | 'high' | 'critical'
    due_date: string
    project_path: string
    document_id: number
    assignee_username: string
}>): Promise<InvestigationTask> {
    const response = await apiFetch(`${API_BASE}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
    await ensureOk(response, 'Failed to update task')
    return response.json()
}

export async function deleteInvestigationTask(taskId: number): Promise<void> {
    const response = await apiFetch(`${API_BASE}/tasks/${taskId}`, { method: 'DELETE' })
    await ensureOk(response, 'Failed to delete task')
}

export async function createScan(path: string, enableEmbeddings: boolean = false): Promise<Scan> {
    const response = await apiFetch(`${API_BASE}/scan/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, enable_embeddings: enableEmbeddings })
    })
    await ensureOk(response, 'Failed to create scan')
    return response.json()
}

export async function getScans(): Promise<Scan[]> {
    const response = await apiFetch(`${API_BASE}/scan/`)
    await ensureOk(response, 'Failed to fetch scans')
    return response.json()
}

export async function getScan(scanId: number): Promise<Scan> {
    const response = await apiFetch(`${API_BASE}/scan/${scanId}`)
    await ensureOk(response, 'Failed to fetch scan')
    return response.json()
}

export async function getScanProgress(scanId: number): Promise<ScanProgress> {
    const response = await apiFetch(`${API_BASE}/scan/${scanId}/progress`)
    await ensureOk(response, 'Failed to fetch scan progress')
    return response.json()
}

export async function cancelScan(scanId: number): Promise<void> {
    const response = await apiFetch(`${API_BASE}/scan/${scanId}/cancel`, {
        method: 'POST'
    })
    await ensureOk(response, 'Failed to cancel scan')
}

export async function resumeScan(scanId: number): Promise<Scan> {
    const response = await apiFetch(`${API_BASE}/scan/${scanId}/resume`, {
        method: 'POST'
    })
    await ensureOk(response, 'Failed to resume scan')
    return response.json()
}

export async function deleteScan(scanId: number): Promise<void> {
    const response = await apiFetch(`${API_BASE}/scan/${scanId}`, {
        method: 'DELETE'
    })
    await ensureOk(response, 'Failed to delete scan')
}

export interface SearchFacets {
    file_types: Array<{ value: string; count: number }>
    size_ranges: Array<{ label: string; min: number; max: number | null; count: number }>
    date_range: { min: string; max: string } | null
    top_entities: Array<{ name: string; type: string; count: number }>
}

export async function getSearchFacets(projectPath?: string): Promise<SearchFacets> {
    const params = new URLSearchParams()
    if (projectPath) params.append('project_path', projectPath)
    const url = `${API_BASE}/search/facets${params.toString() ? '?' + params.toString() : ''}`
    const response = await apiFetch(url)
    await ensureOk(response, 'Failed to fetch search facets')
    return response.json()
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
    await ensureOk(response, 'Search failed')
    return response.json()
}

export async function getDocument(documentId: number): Promise<Document & { text_content: string }> {
    const response = await apiFetch(`${API_BASE}/documents/${documentId}`)
    await ensureOk(response, 'Failed to fetch document')
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
    await ensureOk(response, 'Failed to fetch highlights')
    return response.json()
}

export function getDocumentFileUrl(documentId: number): string {
    return `${API_BASE}/documents/${documentId}/file`
}

export async function getStats(): Promise<Stats> {
    const response = await apiFetch(`${API_BASE}/stats/`)
    await ensureOk(response, 'Failed to fetch stats')
    return response.json()
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

export async function getDocuments(filters?: BrowseFilters): Promise<DocumentListResponse> {
    const params = new URLSearchParams()

    if (filters?.skip !== undefined) params.append('skip', String(filters.skip))
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit))
    if (filters?.file_types) {
        filters.file_types.forEach(t => params.append('file_types', t))
    }
    if (filters?.project_path) params.append('project_path', filters.project_path)
    if (filters?.date_from) params.append('date_from', filters.date_from)
    if (filters?.date_to) params.append('date_to', filters.date_to)
    if (filters?.sort_by) params.append('sort_by', filters.sort_by)
    if (filters?.search) params.append('search', filters.search)

    const queryString = params.toString()
    const url = `${API_BASE}/documents/${queryString ? '?' + queryString : ''}`

    const response = await apiFetch(url)
    await ensureOk(response, 'Failed to fetch documents')
    return response.json()
}

export async function checkHealth(): Promise<HealthStatus> {
    const response = await apiFetch(`${API_BASE}/health/`)
    await ensureOk(response, 'Health check failed')
    return response.json()
}

// SSE connection for real-time scan progress with auto-reconnect
// Uses fetch() instead of EventSource to support JWT auth headers
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
    let abortController: AbortController | null = null
    const MAX_RETRIES = 10
    const BASE_DELAY = 1000
    const MAX_DELAY = 30000

    function parseSSEEvents(chunk: string): Array<{ event: string; data: string }> {
        const events: Array<{ event: string; data: string }> = []
        const blocks = chunk.split('\n\n')
        for (const block of blocks) {
            if (!block.trim()) continue
            let event = 'message'
            let data = ''
            for (const line of block.split('\n')) {
                if (line.startsWith('event: ')) event = line.slice(7).trim()
                else if (line.startsWith('data: ')) data = line.slice(6)
            }
            if (data) events.push({ event, data })
        }
        return events
    }

    async function connect() {
        if (closed) return
        abortController = new AbortController()

        try {
            const response = await apiFetch(`${API_BASE}/scan/${scanId}/stream`, {
                signal: abortController.signal,
                headers: { 'Accept': 'text/event-stream' },
            })

            if (!response.ok) {
                throw new Error(`SSE: HTTP ${response.status}`)
            }

            const reader = response.body?.getReader()
            if (!reader) throw new Error('SSE: No readable stream')

            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done || closed) break

                buffer += decoder.decode(value, { stream: true })

                // Process complete SSE events (separated by \n\n)
                while (buffer.includes('\n\n')) {
                    const idx = buffer.indexOf('\n\n')
                    const eventBlock = buffer.slice(0, idx)
                    buffer = buffer.slice(idx + 2)

                    const events = parseSSEEvents(eventBlock + '\n\n')
                    for (const evt of events) {
                        try {
                            retryCount = 0 // Reset on successful data
                            const data = JSON.parse(evt.data) as ScanProgress

                            if (evt.event === 'complete') {
                                onProgress(data)
                                closed = true
                                reader.cancel()
                                onComplete?.()
                                return
                            } else if (evt.event === 'error') {
                                console.error('SSE server error:', evt.data)
                                onError?.(new Event('error') as Event)
                                return
                            } else {
                                onProgress(data)
                            }
                        } catch (e) {
                            console.error('Failed to parse SSE data:', e)
                        }
                    }
                }
            }
        } catch (err) {
            if (closed) return
            if ((err as Error).name === 'AbortError') return

            // Connection lost — attempt reconnect
            retryCount++
            if (retryCount > MAX_RETRIES) {
                console.error(`SSE: max retries (${MAX_RETRIES}) reached, giving up`)
                onError?.(new Event('error') as Event)
                return
            }

            const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount - 1), MAX_DELAY)
            console.warn(`SSE: reconnecting in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`)
            onReconnecting?.(retryCount)
            retryTimer = setTimeout(connect, delay)
        }
    }

    connect()

    return {
        close: () => {
            closed = true
            if (retryTimer) clearTimeout(retryTimer)
            abortController?.abort()
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
    await ensureOk(response, 'Failed to fetch tags')
    return response.json()
}

export async function createTag(name: string, color: string = '#3b82f6'): Promise<Tag> {
    const response = await apiFetch(`${API_BASE}/tags/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color })
    })
    await ensureOk(response, 'Failed to create tag')
    return response.json()
}

export async function updateTag(tagId: number, updates: { name?: string; color?: string }): Promise<Tag> {
    const response = await apiFetch(`${API_BASE}/tags/${tagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    })
    await ensureOk(response, 'Failed to update tag')
    return response.json()
}

export async function deleteTag(tagId: number): Promise<void> {
    const response = await apiFetch(`${API_BASE}/tags/${tagId}`, { method: 'DELETE' })
    await ensureOk(response, 'Failed to delete tag')
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
    await ensureOk(response, 'Failed to fetch favorites')
    return response.json()
}

export async function addFavorite(documentId: number, notes?: string, tagIds?: number[]): Promise<Favorite> {
    const response = await apiFetch(`${API_BASE}/favorites/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, notes, tag_ids: tagIds })
    })
    await ensureOk(response, 'Failed to add favorite')
    return response.json()
}

export async function updateFavorite(documentId: number, updates: { notes?: string; tag_ids?: number[] }): Promise<Favorite> {
    const response = await apiFetch(`${API_BASE}/favorites/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    })
    await ensureOk(response, 'Failed to update favorite')
    return response.json()
}

export async function removeFavorite(documentId: number): Promise<void> {
    const response = await apiFetch(`${API_BASE}/favorites/${documentId}`, { method: 'DELETE' })
    await ensureOk(response, 'Failed to remove favorite')
}

export async function checkFavoriteStatus(documentId: number): Promise<FavoriteStatus> {
    const response = await apiFetch(`${API_BASE}/favorites/check/${documentId}`)
    await ensureOk(response, 'Failed to check favorite status')
    return response.json()
}

// Factory reset - delete ALL data
export async function factoryReset(): Promise<{ deleted_scans: number; deleted_documents: number }> {
    const response = await apiFetch(`${API_BASE}/scan/factory-reset`, {
        method: 'POST'
    })
    await ensureOk(response, 'Failed to factory reset')
    return response.json()
}

// =============================================================================
// DEEP ANALYSIS API (LangExtract)
// =============================================================================

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

export async function getDeepAnalysis(documentId: number): Promise<DeepAnalysis | null> {
    const response = await apiFetch(`${API_BASE}/deep-analysis/${documentId}`)
    await ensureOk(response, 'Failed to fetch deep analysis')
    return response.json()
}

export async function getDeepAnalysisStatus(documentId: number): Promise<{ status: string; document_id: number }> {
    const response = await apiFetch(`${API_BASE}/deep-analysis/${documentId}/status`)
    await ensureOk(response, 'Failed to fetch analysis status')
    return response.json()
}

export async function triggerDeepAnalysis(documentId: number): Promise<{ status: string; task_id?: string }> {
    const response = await apiFetch(`${API_BASE}/deep-analysis/${documentId}/trigger`, {
        method: 'POST'
    })
    await ensureOk(response, 'Failed to trigger deep analysis')
    return response.json()
}

export async function triggerBatchDeepAnalysis(documentIds: number[]): Promise<{
    status: string
    task_id?: string
    total: number
    already_completed?: number
}> {
    const response = await apiFetch(`${API_BASE}/deep-analysis/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_ids: documentIds })
    })
    await ensureOk(response, 'Failed to trigger batch analysis')
    return response.json()
}
