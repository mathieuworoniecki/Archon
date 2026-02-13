import { API_BASE, apiFetch, ensureOk } from './client'
import type { InvestigationTask } from './types'

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
