import { API_BASE, apiFetch, ensureOk } from './client'
import type { WatchlistRule, WatchlistRunResult } from './types'

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
