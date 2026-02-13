import { API_BASE, apiFetch, ensureOk } from './client'
import type { DeepAnalysis } from './types'

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
