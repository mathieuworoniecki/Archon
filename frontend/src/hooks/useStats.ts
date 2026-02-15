import { useCallback } from 'react'
import { getStats, Stats } from '@/lib/api'
import { usePersistedQuery } from './usePersistedQuery'

export function useStats() {
    const fetchStats = useCallback(async (): Promise<Stats> => {
        return await getStats()
    }, [])

    const { data, isLoading, error, refetch } = usePersistedQuery<Stats>(
        'archon_stats_cache_v1',
        fetchStats,
        { version: 1, maxAgeMs: 60 * 1000 },
    )

    const stats = data

    return {
        stats,
        isLoading,
        error,
        refetch,
        hasDocuments: (stats?.total_documents ?? 0) > 0
    }
}
