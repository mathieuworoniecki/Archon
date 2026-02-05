import { useState, useEffect, useCallback } from 'react'
import { getStats, Stats } from '@/lib/api'

export function useStats() {
    const [stats, setStats] = useState<Stats | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchStats = useCallback(async () => {
        try {
            setIsLoading(true)
            setError(null)
            const data = await getStats()
            setStats(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch stats')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchStats()
    }, [fetchStats])

    return {
        stats,
        isLoading,
        error,
        refetch: fetchStats,
        hasDocuments: (stats?.total_documents ?? 0) > 0
    }
}
