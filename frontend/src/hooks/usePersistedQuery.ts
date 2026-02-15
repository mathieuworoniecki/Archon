import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadPersisted, savePersisted } from '@/lib/persisted'

interface UsePersistedQueryOptions {
    enabled?: boolean
    version?: number
    maxAgeMs?: number
    /** Revalidate immediately on mount (default: true) */
    revalidateOnMount?: boolean
}

export function usePersistedQuery<T>(
    storageKey: string,
    fetcher: () => Promise<T>,
    options?: UsePersistedQueryOptions,
) {
    const enabled = options?.enabled ?? true
    const version = options?.version ?? 1
    const revalidateOnMount = options?.revalidateOnMount ?? true
    const maxAgeMs = options?.maxAgeMs

    const initial = useMemo(
        () => loadPersisted<T>(storageKey, { version, maxAgeMs }),
        [maxAgeMs, storageKey, version],
    )
    const [data, setData] = useState<T | null>(initial)
    const [error, setError] = useState<string | null>(null)
    const [isFetching, setIsFetching] = useState(false)
    const seqRef = useRef(0)

    const refetch = useCallback(async () => {
        const seq = ++seqRef.current
        setIsFetching(true)
        setError(null)

        try {
            const next = await fetcher()
            if (seqRef.current !== seq) return
            setData(next)
            savePersisted(storageKey, next, version)
        } catch (err) {
            if (seqRef.current !== seq) return
            setError(err instanceof Error ? err.message : 'Failed to fetch')
        } finally {
            if (seqRef.current === seq) setIsFetching(false)
        }
    }, [fetcher, storageKey, version])

    useEffect(() => {
        if (!enabled) return
        if (!revalidateOnMount) return
        refetch()
    }, [enabled, revalidateOnMount, refetch])

    const isLoading = data === null && isFetching

    return {
        data,
        error,
        isLoading,
        isFetching,
        refetch,
        setData,
    }
}

