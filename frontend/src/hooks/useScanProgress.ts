import { useState, useEffect, useCallback, useRef } from 'react'
import { ScanProgress, connectScanWebSocket } from '@/lib/api'

export function useScanProgress(scanId: number | null) {
    const [progress, setProgress] = useState<ScanProgress | null>(null)
    const [isComplete, setIsComplete] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const wsRef = useRef<WebSocket | null>(null)

    useEffect(() => {
        if (!scanId) return

        const ws = connectScanWebSocket(
            scanId,
            (message) => {
                if (message.type === 'progress') {
                    setProgress(message.data)
                } else if (message.type === 'complete') {
                    setProgress(message.data)
                    setIsComplete(true)
                } else if (message.type === 'error') {
                    setError((message.data as { message?: string }).message || 'Unknown error')
                }
            },
            () => {
                setError('WebSocket connection failed')
            }
        )

        wsRef.current = ws

        return () => {
            ws.close()
        }
    }, [scanId])

    const disconnect = useCallback(() => {
        wsRef.current?.close()
    }, [])

    return { progress, isComplete, error, disconnect }
}
