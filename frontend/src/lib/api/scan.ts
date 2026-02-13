import { API_BASE, apiFetch, ensureOk } from './client'
import type { Scan, ScanEstimate, ScanProgress } from './types'

export async function estimateScan(path: string): Promise<ScanEstimate> {
    const response = await apiFetch(`${API_BASE}/scan/estimate?path=${encodeURIComponent(path)}`, {
        method: 'POST',
    })
    await ensureOk(response, 'Failed to estimate scan')
    return response.json()
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

// Factory reset - delete ALL data
export async function factoryReset(): Promise<{ deleted_scans: number; deleted_documents: number }> {
    const response = await apiFetch(`${API_BASE}/scan/factory-reset`, {
        method: 'POST'
    })
    await ensureOk(response, 'Failed to factory reset')
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
