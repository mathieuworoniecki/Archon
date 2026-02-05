import { createContext, useContext, useState, ReactNode, useCallback } from 'react'
import { SearchResult, FileType } from '@/lib/api'

interface DateRange {
    from?: Date
    to?: Date
}

interface CockpitFilters {
    query: string
    semanticWeight: number
    fileTypes: FileType[]
    dateRange: DateRange
    selectedEntity?: string
}

interface CockpitState {
    // Selection
    selectedDocumentId: number | null
    selectedResult: SearchResult | null
    
    // Filters
    filters: CockpitFilters
    
    // Results
    results: SearchResult[]
    totalResults: number
    isLoading: boolean
    
    // View
    viewerMode: 'pdf' | 'text' | 'image'
}

interface CockpitActions {
    setSelectedDocument: (id: number | null, result?: SearchResult | null) => void
    updateFilters: (filters: Partial<CockpitFilters>) => void
    setResults: (results: SearchResult[], total: number) => void
    setLoading: (loading: boolean) => void
    setViewerMode: (mode: 'pdf' | 'text' | 'image') => void
    clearSelection: () => void
}

const CockpitContext = createContext<(CockpitState & CockpitActions) | null>(null)

export function useCockpit() {
    const context = useContext(CockpitContext)
    if (!context) {
        throw new Error('useCockpit must be used within CockpitProvider')
    }
    return context
}

const initialFilters: CockpitFilters = {
    query: '',
    semanticWeight: 0.5,
    fileTypes: [],
    dateRange: {},
}

export function CockpitProvider({ children }: { children: ReactNode }) {
    const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null)
    const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
    const [filters, setFilters] = useState<CockpitFilters>(initialFilters)
    const [results, setResultsState] = useState<SearchResult[]>([])
    const [totalResults, setTotalResults] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [viewerMode, setViewerMode] = useState<'pdf' | 'text' | 'image'>('pdf')

    const setSelectedDocument = useCallback((id: number | null, result?: SearchResult | null) => {
        setSelectedDocumentId(id)
        setSelectedResult(result ?? null)
    }, [])

    const updateFilters = useCallback((newFilters: Partial<CockpitFilters>) => {
        setFilters(prev => ({ ...prev, ...newFilters }))
    }, [])

    const setResults = useCallback((newResults: SearchResult[], total: number) => {
        setResultsState(newResults)
        setTotalResults(total)
    }, [])

    const setLoading = useCallback((loading: boolean) => {
        setIsLoading(loading)
    }, [])

    const clearSelection = useCallback(() => {
        setSelectedDocumentId(null)
        setSelectedResult(null)
    }, [])

    const value: CockpitState & CockpitActions = {
        // State
        selectedDocumentId,
        selectedResult,
        filters,
        results,
        totalResults,
        isLoading,
        viewerMode,
        // Actions
        setSelectedDocument,
        updateFilters,
        setResults,
        setLoading,
        setViewerMode,
        clearSelection,
    }

    return (
        <CockpitContext.Provider value={value}>
            {children}
        </CockpitContext.Provider>
    )
}
