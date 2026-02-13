import { authFetch } from '../auth'

export const API_BASE = '/api'

// Use authFetch for all API calls (injects JWT Bearer token)
export const apiFetch = authFetch

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

export async function ensureOk(response: Response, fallbackMessage: string): Promise<void> {
    if (response.ok) return
    throw await buildAPIError(response, fallbackMessage)
}
