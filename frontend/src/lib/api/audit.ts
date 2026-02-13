import { API_BASE, apiFetch, ensureOk } from './client'
import type { AuditLogEntry, AuditLogQuery, AuditTrailResponse } from './types'

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
