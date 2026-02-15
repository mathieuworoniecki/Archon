import { useState, useEffect, useCallback, useRef } from 'react'
import { ScanProgress, connectScanStream } from '@/lib/api'

export function useScanProgress(scanId: number | null) {
    const [progress, setProgress] = useState<ScanProgress | null>(null)
    // "Finished" means the server sent a terminal "complete" SSE event (completed/failed/cancelled).
    const [isFinished, setIsFinished] = useState(false)
    const [isReconnecting, setIsReconnecting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const connectionRef = useRef<{ close: () => void } | null>(null)

    useEffect(() => {
        if (!scanId) return

        setIsFinished(false)
        setIsReconnecting(false)
        setError(null)

        const connection = connectScanStream(
            scanId,
            (data) => {
                setIsReconnecting(false)
                setProgress(data)
                if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
                    setIsFinished(true)
                }
            },
            () => {
                setIsReconnecting(false)
                setIsFinished(true)
            },
            () => {
                setIsReconnecting(false)
                setError('Connection failed')
            },
            (attempt) => {
                setIsReconnecting(true)
                void attempt // reconnection attempt tracked via isReconnecting state
            }
        )

        connectionRef.current = connection

        return () => {
            connection.close()
        }
    }, [scanId])

    const disconnect = useCallback(() => {
        connectionRef.current?.close()
    }, [])

    const isComplete = progress?.status === 'completed'

    return { progress, isFinished, isComplete, isReconnecting, error, disconnect }
}
