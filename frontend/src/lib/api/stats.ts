import { API_BASE, apiFetch, ensureOk } from './client'
import type { HealthStatus, Stats } from './types'

export async function getStats(): Promise<Stats> {
    const response = await apiFetch(`${API_BASE}/stats/`)
    await ensureOk(response, 'Failed to fetch stats')
    return response.json()
}

export async function checkHealth(): Promise<HealthStatus> {
    const response = await apiFetch(`${API_BASE}/health/`)
    await ensureOk(response, 'Health check failed')
    return response.json()
}
