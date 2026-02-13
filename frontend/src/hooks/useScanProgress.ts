import { useState, useEffect, useCallback, useRef } from 'react'
import { ScanProgress, connectScanStream } from '@/lib/api'

export function useScanProgress(scanId: number | null) {
    const [progress, setProgress] = useState<ScanProgress | null>(null)
    const [isComplete, setIsComplete] = useState(false)
    const [isReconnecting, setIsReconnecting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const connectionRef = useRef<{ close: () => void } | null>(null)

    useEffect(() => {
        if (!scanId) return

        setIsComplete(false)
        setIsReconnecting(false)
        setError(null)

        const connection = connectScanStream(
            scanId,
            (data) => {
                setIsReconnecting(false)
                setProgress(data)
            },
            () => {
                setIsReconnecting(false)
                setIsComplete(true)
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

    return { progress, isComplete, isReconnecting, error, disconnect }
}
