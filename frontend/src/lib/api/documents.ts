import { API_BASE, apiFetch, ensureOk } from './client'
import type { BrowseFilters, Document, DocumentListResponse } from './types'
import { withAuthTokenQuery } from '@/lib/auth'

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
    return withAuthTokenQuery(`${API_BASE}/documents/${documentId}/file`)
}

export function getDocumentThumbnailUrl(documentId: number, size?: number): string {
    const base = `${API_BASE}/documents/${documentId}/thumbnail`
    const url = size ? `${base}?size=${size}` : base
    return withAuthTokenQuery(url)
}

export async function getDocuments(filters?: BrowseFilters): Promise<DocumentListResponse> {
    const params = new URLSearchParams()

    if (filters?.skip !== undefined) params.append('skip', String(filters.skip))
    if (filters?.limit !== undefined) params.append('limit', String(filters.limit))
    if (filters?.file_types) {
        filters.file_types.forEach((t) => params.append('file_types', t))
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
