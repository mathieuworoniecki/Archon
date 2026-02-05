import { useState, useCallback, useEffect } from 'react'
import { getDocuments, Document, BrowseFilters, FileType, SortBy } from '@/lib/api'

export interface UseBrowseState {
    documents: Document[]
    total: number
    isLoading: boolean
    error: string | null
    filters: BrowseFilters
}

export function useBrowse(initialFilters?: BrowseFilters) {
    const [documents, setDocuments] = useState<Document[]>([])
    const [total, setTotal] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [filters, setFilters] = useState<BrowseFilters>({
        skip: 0,
        limit: 50,
        sort_by: 'indexed_desc',
        ...initialFilters
    })

    const fetchDocuments = useCallback(async (newFilters?: BrowseFilters) => {
        const activeFilters = newFilters ?? filters
        setIsLoading(true)
        setError(null)

        try {
            const response = await getDocuments(activeFilters)
            setDocuments(response.documents)
            setTotal(response.total)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch documents')
        } finally {
            setIsLoading(false)
        }
    }, [filters])

    // Fetch on mount and when filters change
    useEffect(() => {
        fetchDocuments()
    }, [filters])

    const updateFilters = useCallback((newFilters: Partial<BrowseFilters>) => {
        setFilters(prev => ({
            ...prev,
            ...newFilters,
            skip: newFilters.skip ?? 0 // Reset pagination when filters change (unless explicitly set)
        }))
    }, [])

    const toggleFileType = useCallback((fileType: FileType) => {
        setFilters(prev => {
            const current = prev.file_types ?? []
            const updated = current.includes(fileType)
                ? current.filter(t => t !== fileType)
                : [...current, fileType]
            return {
                ...prev,
                file_types: updated.length > 0 ? updated : undefined,
                skip: 0
            }
        })
    }, [])

    const setDateRange = useCallback((from?: string, to?: string) => {
        setFilters(prev => ({
            ...prev,
            date_from: from,
            date_to: to,
            skip: 0
        }))
    }, [])

    const setSortBy = useCallback((sort: SortBy) => {
        setFilters(prev => ({
            ...prev,
            sort_by: sort,
            skip: 0
        }))
    }, [])

    const nextPage = useCallback(() => {
        const currentSkip = filters.skip ?? 0
        const limit = filters.limit ?? 50
        if (currentSkip + limit < total) {
            setFilters(prev => ({
                ...prev,
                skip: currentSkip + limit
            }))
        }
    }, [filters.skip, filters.limit, total])

    const prevPage = useCallback(() => {
        const currentSkip = filters.skip ?? 0
        const limit = filters.limit ?? 50
        if (currentSkip > 0) {
            setFilters(prev => ({
                ...prev,
                skip: Math.max(0, currentSkip - limit)
            }))
        }
    }, [filters.skip, filters.limit])

    const clearFilters = useCallback(() => {
        setFilters({
            skip: 0,
            limit: 50,
            sort_by: 'indexed_desc'
        })
    }, [])

    return {
        documents,
        total,
        isLoading,
        error,
        filters,
        updateFilters,
        toggleFileType,
        setDateRange,
        setSortBy,
        nextPage,
        prevPage,
        clearFilters,
        refetch: fetchDocuments
    }
}
