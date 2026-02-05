import { useState, useCallback } from 'react'
import { search, SearchResult } from '@/lib/api'

export interface SearchOptions {
    limit?: number
    offset?: number
    file_types?: string[]
    scan_ids?: number[]
    semantic_weight?: number
}

export function useSearch() {
    const [results, setResults] = useState<SearchResult[]>([])
    const [totalResults, setTotalResults] = useState(0)
    const [processingTime, setProcessingTime] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [lastQuery, setLastQuery] = useState('')

    const performSearch = useCallback(async (query: string, options?: SearchOptions) => {
        if (!query.trim()) {
            setResults([])
            setTotalResults(0)
            return
        }

        setIsLoading(true)
        setError(null)
        setLastQuery(query)

        try {
            const response = await search(query, options)
            setResults(response.results)
            setTotalResults(response.total_results)
            setProcessingTime(response.processing_time_ms)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed')
            setResults([])
            setTotalResults(0)
        } finally {
            setIsLoading(false)
        }
    }, [])

    const clearResults = useCallback(() => {
        setResults([])
        setTotalResults(0)
        setLastQuery('')
        setError(null)
    }, [])

    return {
        results,
        totalResults,
        processingTime,
        isLoading,
        error,
        lastQuery,
        performSearch,
        clearResults
    }
}
