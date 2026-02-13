import { API_BASE, apiFetch, ensureOk } from './client'
import type { Favorite, FavoriteListResponse, FavoriteStatus, Tag } from './types'

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
        tagIds.forEach((id) => params.append('tag_ids', String(id)))
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
