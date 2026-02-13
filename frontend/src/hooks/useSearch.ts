import { useState, useCallback, useRef } from 'react'
import { search, SearchResult } from '@/lib/api'

const PAGE_SIZE = 20

export interface SearchOptions {
    limit?: number
    offset?: number
    file_types?: string[]
    scan_ids?: number[]
    semantic_weight?: number
    project_path?: string
}

function buildQuerySignature(query: string, options: SearchOptions): string {
    const normalized = {
        query: query.trim(),
        limit: options.limit ?? PAGE_SIZE,
        offset: options.offset ?? 0,
        semantic_weight: options.semantic_weight ?? null,
        project_path: options.project_path ?? null,
        file_types: [...(options.file_types ?? [])].sort(),
        scan_ids: [...(options.scan_ids ?? [])].sort((a, b) => a - b),
    }
    return JSON.stringify(normalized)
}

export function useSearch() {
    const [results, setResults] = useState<SearchResult[]>([])
    const [totalResults, setTotalResults] = useState(0)
    const [processingTime, setProcessingTime] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
    const [lastQuery, setLastQuery] = useState('')
    const lastOptionsRef = useRef<SearchOptions | null>(null)
    const loadingMoreRef = useRef(false)
    const querySignatureRef = useRef<string>('')

    const performSearch = useCallback(async (query: string, options?: SearchOptions) => {
        const normalizedQuery = query.trim()
        if (!normalizedQuery) {
            setResults([])
            setTotalResults(0)
            setLastQuery('')
            lastOptionsRef.current = null
            querySignatureRef.current = ''
            return
        }

        setIsLoading(true)
        setError(null)
        setLoadMoreError(null)
        setLastQuery(normalizedQuery)
        const opts = {
            ...options,
            limit: options?.limit ?? PAGE_SIZE,
            offset: 0,
        }
        const signature = buildQuerySignature(normalizedQuery, opts)
        lastOptionsRef.current = { ...opts }
        querySignatureRef.current = signature

        try {
            const response = await search(normalizedQuery, opts)
            // Ignore stale responses if search context changed while request was in flight.
            if (querySignatureRef.current !== signature) return
            setResults(response.results)
            setTotalResults(response.total_results)
            setProcessingTime(response.processing_time_ms)
        } catch (err) {
            if (querySignatureRef.current !== signature) return
            setError(err instanceof Error ? err.message : 'Search failed')
            setResults([])
            setTotalResults(0)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const loadMore = useCallback(async () => {
        if (loadingMoreRef.current) return
        const query = lastQuery.trim()
        const opts = lastOptionsRef.current
        if (!query || !opts || results.length >= totalResults) return
        const currentSignature = querySignatureRef.current

        loadingMoreRef.current = true
        setIsLoadingMore(true)
        try {
            const limit = opts.limit ?? PAGE_SIZE
            const offset = results.length
            const response = await search(query, {
                ...opts,
                limit,
                offset,
            })
            // Drop stale pagination responses when filters/query changed.
            if (querySignatureRef.current !== currentSignature) return

            setResults((prev) => {
                const seen = new Set(prev.map((item) => item.document_id))
                const appendOnly = response.results.filter((item) => !seen.has(item.document_id))
                return [...prev, ...appendOnly]
            })
            setTotalResults(response.total_results)
            setLoadMoreError(null)
        } catch (err) {
            if (querySignatureRef.current !== currentSignature) return
            setLoadMoreError(err instanceof Error ? err.message : 'Failed to load more')
        } finally {
            loadingMoreRef.current = false
            setIsLoadingMore(false)
        }
    }, [lastQuery, results.length, totalResults])

    const clearResults = useCallback(() => {
        setResults([])
        setTotalResults(0)
        setLastQuery('')
        lastOptionsRef.current = null
        querySignatureRef.current = ''
        setError(null)
        setLoadMoreError(null)
    }, [])

    const hasMore = results.length < totalResults && lastQuery.length > 0

    const retry = useCallback(() => {
        if (!lastQuery.trim()) return
        const opts = lastOptionsRef.current
        performSearch(lastQuery, opts ?? undefined)
    }, [lastQuery, performSearch])

    return {
        results,
        totalResults,
        processingTime,
        isLoading,
        isLoadingMore,
        hasMore,
        error,
        loadMoreError,
        lastQuery,
        performSearch,
        loadMore,
        clearResults,
        retry,
    }
}
