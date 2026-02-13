import { API_BASE, apiFetch, ensureOk } from './client'
import type { SearchFacets, SearchResponse } from './types'

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
