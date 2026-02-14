import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ResultList } from '@/components/search/ResultList'
import { ResultGrid } from '@/components/search/ResultGrid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSearch } from '@/hooks/useSearch'
import { useStats } from '@/hooks/useStats'
import { useBrowse } from '@/hooks/useBrowse'
import { SearchResult, FileType, SortBy, getDocument, getSearchFacets, triggerBatchDeepAnalysis } from '@/lib/api'
import { useTranslation } from '@/contexts/I18nContext'
import { useProject } from '@/contexts/ProjectContext'
import { cn } from '@/lib/utils'
import { getDateFromDays, getDateRangeFromParam } from '@/lib/dateRange'
import {
    Search,
    FileText,
    Image,
    FileType2,
    Calendar,
    SortDesc,
    ChevronLeft,
    ChevronRight,
    Video,
    Filter,
    Sparkles,
    Zap,
    LayoutGrid,
    Columns2,
    ZoomOut,
    ZoomIn,
    X,
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type QueryMode = 'filename' | 'content'
type DocumentsLayout = 'split' | 'grid'

type PendingViewerSelection =
    | { kind: 'index'; index: number }
    | { kind: 'edge'; edge: 'first' | 'last' }

const RECENT_SEARCHES_KEY = 'archon_recent_searches'
const DOCUMENTS_LAYOUT_KEY = 'archon_documents_layout'
const GRID_THUMB_SIZE_KEY = 'archon_grid_thumb_size'
const SEARCH_PAGE_SIZE_KEY = 'archon_search_page_size'
const DOCUMENTS_SIDEBAR_KEY = 'archon_documents_sidebar_visible'

export function HomePage() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()

    const queryParam = (searchParams.get('q') ?? '').trim()
    const dateParam = searchParams.get('date')
    const typesParam = searchParams.get('types')
    const docParam = searchParams.get('doc')

    const {
        results,
        totalResults,
        processingTime,
        isLoading,
        isLoadingMore,
        hasMore,
        lastQuery,
        error,
        loadMoreError,
        performSearch,
        loadMore,
        retry,
        clearResults,
    } = useSearch()

    const browse = useBrowse()

    const { isLoading: statsLoading, hasDocuments } = useStats()
    const { selectedProject, projects, selectProject } = useProject()
    const { t, locale } = useTranslation()

    const initialTypes = useMemo(() => {
        if (!typesParam) return [] as FileType[]
        return typesParam
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean) as FileType[]
    }, [typesParam])

    const requestedDocId = useMemo(() => {
        if (!docParam) return null
        const parsed = Number(docParam)
        if (!Number.isFinite(parsed) || parsed <= 0) return null
        return parsed
    }, [docParam])

    const [queryMode, setQueryMode] = useState<QueryMode>(() => (queryParam ? 'content' : 'filename'))
    const [queryInput, setQueryInput] = useState(queryParam)
    const [documentsLayout, setDocumentsLayout] = useState<DocumentsLayout>(() => {
        // If the URL points to a specific document, assume the user wants the viewer open.
        if (docParam) return 'split'
        try {
            const saved = localStorage.getItem(DOCUMENTS_LAYOUT_KEY)
            if (saved === 'grid' || saved === 'split') return saved
        } catch {
            // ignore
        }
        return 'grid'
    })
    const [gridThumbnailSize, setGridThumbnailSize] = useState<number>(() => {
        try {
            const saved = Number(localStorage.getItem(GRID_THUMB_SIZE_KEY))
            if (Number.isFinite(saved) && saved >= 80 && saved <= 300) return saved
        } catch {
            // ignore
        }
        return 160
    })
    const [searchPageSize, setSearchPageSize] = useState<number>(() => {
        try {
            const saved = Number(localStorage.getItem(SEARCH_PAGE_SIZE_KEY))
            if (Number.isFinite(saved) && saved >= 20 && saved <= 100) return saved
        } catch {
            // ignore
        }
        return 50
    })
    const [isSidebarVisible, setIsSidebarVisible] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(DOCUMENTS_SIDEBAR_KEY)
            if (saved === '0') return false
            if (saved === '1') return true
        } catch {
            // ignore
        }
        return true
    })
    const [semanticWeight, setSemanticWeight] = useState(0.5)
    const [selectedFileTypes, setSelectedFileTypes] = useState<FileType[]>(initialTypes)
    const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
    const [batchScanStatus, setBatchScanStatus] = useState<'idle' | 'loading' | 'triggered' | 'complete'>('idle')
    const [fileTypeCounts, setFileTypeCounts] = useState<Record<string, number>>({})
    const pendingViewerSelectionRef = useRef<PendingViewerSelection | null>(null)

    const saveRecentSearch = useCallback((query: string) => {
        const normalized = query.trim()
        if (!normalized) return
        try {
            const current: string[] = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]')
            const updated = [normalized, ...current.filter((entry) => entry !== normalized)].slice(0, 10)
            localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
        } catch {
            // Ignore localStorage errors
        }
    }, [])

    const updateTypesInUrl = useCallback((nextTypes: FileType[]) => {
        const next = new URLSearchParams(searchParams)
        if (nextTypes.length > 0) next.set('types', nextTypes.join(','))
        else next.delete('types')
        setSearchParams(next, { replace: true })
    }, [searchParams, setSearchParams])

    const runContentSearch = useCallback((rawQuery: string, weight = semanticWeight, types = selectedFileTypes, limit = searchPageSize) => {
        const q = rawQuery.trim()
        if (!q) {
            clearResults()
            const next = new URLSearchParams(searchParams)
            next.delete('q')
            setSearchParams(next, { replace: true })
            return
        }

        saveRecentSearch(q)
        performSearch(q, {
            semantic_weight: weight,
            project_path: selectedProject?.path,
            file_types: types.length ? types : undefined,
            limit,
        })
        setSelectedResult(null)

        const next = new URLSearchParams(searchParams)
        next.set('q', q)
        if (types.length > 0) next.set('types', types.join(','))
        else next.delete('types')
        next.delete('date')
        setSearchParams(next, { replace: true })
    }, [
        clearResults,
        performSearch,
        saveRecentSearch,
        searchParams,
        selectedProject?.path,
        selectedFileTypes,
        semanticWeight,
        searchPageSize,
        setSearchParams,
    ])

    useEffect(() => {
        try {
            localStorage.setItem(DOCUMENTS_LAYOUT_KEY, documentsLayout)
        } catch {
            // ignore
        }
    }, [documentsLayout])

    useEffect(() => {
        try {
            localStorage.setItem(GRID_THUMB_SIZE_KEY, String(gridThumbnailSize))
        } catch {
            // ignore
        }
    }, [gridThumbnailSize])

    useEffect(() => {
        try {
            localStorage.setItem(SEARCH_PAGE_SIZE_KEY, String(searchPageSize))
        } catch {
            // ignore
        }
    }, [searchPageSize])

    useEffect(() => {
        try {
            localStorage.setItem(DOCUMENTS_SIDEBAR_KEY, isSidebarVisible ? '1' : '0')
        } catch {
            // ignore
        }
    }, [isSidebarVisible])

    // Sync URL query back into UI state.
    useEffect(() => {
        if (queryParam) {
            setQueryMode('content')
            setQueryInput(queryParam)
        }
    }, [queryParam])

    // Sync URL file types back into UI state.
    useEffect(() => {
        setSelectedFileTypes(initialTypes)
    }, [initialTypes])

    // Keep browse filters aligned with selected file types.
    useEffect(() => {
        const current = (browse.filters.file_types ?? []) as FileType[]
        const same = current.length === selectedFileTypes.length
            && current.every((value, idx) => value === selectedFileTypes[idx])

        if (!same) {
            browse.updateFilters({
                file_types: selectedFileTypes.length ? selectedFileTypes : undefined,
            })
        }
    }, [browse.filters.file_types, browse.updateFilters, selectedFileTypes])

    // Apply timeline date preset from URL (compat with redirects).
    useEffect(() => {
        if (!dateParam) return
        const range = getDateRangeFromParam(dateParam)
        if (range) {
            browse.setDateRange(range.from, range.to)
        }
    }, [dateParam, browse.setDateRange])

    // Load per-type counts to make filtering faster in browse/search sidebar.
    useEffect(() => {
        let cancelled = false

        getSearchFacets(selectedProject?.path)
            .then((facets) => {
                if (cancelled) return
                const next: Record<string, number> = {}
                for (const item of facets.file_types ?? []) {
                    next[item.value.toLowerCase()] = item.count
                }
                setFileTypeCounts(next)
            })
            .catch(() => {
                if (!cancelled) setFileTypeCounts({})
            })

        return () => {
            cancelled = true
        }
    }, [selectedProject?.path])

    // Filename mode filters the browse list directly.
    useEffect(() => {
        if (queryMode !== 'filename') return

        const normalizedQuery = queryInput.trim()
        const debounce = setTimeout(() => {
            const currentQuery = browse.filters.search ?? ''
            if (normalizedQuery !== currentQuery) {
                browse.updateFilters({ search: normalizedQuery || undefined })
            }
        }, 250)

        return () => clearTimeout(debounce)
    }, [browse.filters.search, browse.updateFilters, queryInput, queryMode])

    // Restore content search from URL when needed.
    useEffect(() => {
        if (queryMode !== 'content') return
        if (!queryParam) return
        if (queryParam === lastQuery) return

        performSearch(queryParam, {
            semantic_weight: semanticWeight,
            project_path: selectedProject?.path,
            file_types: selectedFileTypes.length ? selectedFileTypes : undefined,
            limit: searchPageSize,
        })
        setSelectedResult(null)
    }, [
        lastQuery,
        performSearch,
        queryMode,
        queryParam,
        semanticWeight,
        selectedFileTypes,
        selectedProject?.path,
        searchPageSize,
    ])

    const handleSelectResult = useCallback((result: SearchResult) => {
        setSelectedResult(result)
    }, [])

    const openResultInSplitView = useCallback((result: SearchResult) => {
        setSelectedResult(result)
        setDocumentsLayout('split')
        const next = new URLSearchParams(searchParams)
        next.set('doc', String(result.document_id))
        setSearchParams(next, { replace: true })
    }, [searchParams, setSearchParams])

    const handleLayoutGrid = useCallback(() => {
        setDocumentsLayout('grid')
        const next = new URLSearchParams(searchParams)
        next.delete('doc')
        setSearchParams(next, { replace: true })
    }, [searchParams, setSearchParams])

    const handleLayoutSplit = useCallback(() => {
        setDocumentsLayout('split')
        if (!selectedResult) return
        const next = new URLSearchParams(searchParams)
        next.set('doc', String(selectedResult.document_id))
        setSearchParams(next, { replace: true })
    }, [searchParams, selectedResult, setSearchParams])

    const handleStartScan = useCallback((projectPath?: string) => {
        if (projectPath) {
            const project = projects.find((entry) => entry.path === projectPath)
            if (project) selectProject(project)
        }
        navigate('/scans')
    }, [navigate, projects, selectProject])

    const handleQueryModeChange = useCallback((mode: QueryMode) => {
        setQueryMode(mode)
        setSelectedResult(null)

        if (mode === 'filename') {
            clearResults()
            const next = new URLSearchParams(searchParams)
            next.delete('q')
            setSearchParams(next, { replace: true })
            return
        }

        browse.updateFilters({ search: undefined })
    }, [browse.updateFilters, clearResults, searchParams, setSearchParams])

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        if (queryMode === 'content') {
            runContentSearch(queryInput)
            return
        }

        browse.updateFilters({ search: queryInput.trim() || undefined })
    }, [browse.updateFilters, queryInput, queryMode, runContentSearch])

    const handleSemanticModeChange = useCallback((nextWeight: number) => {
        setSemanticWeight(nextWeight)
        if (queryMode !== 'content') return

        const activeQuery = (queryParam || lastQuery).trim()
        if (!activeQuery) return

        runContentSearch(activeQuery, nextWeight, selectedFileTypes)
    }, [lastQuery, queryMode, queryParam, runContentSearch, selectedFileTypes])

    const handleToggleFileType = useCallback((type: FileType) => {
        setSelectedFileTypes((prev) => {
            const next = prev.includes(type)
                ? prev.filter((entry) => entry !== type)
                : [...prev, type]

            updateTypesInUrl(next)

            if (queryMode === 'content') {
                const activeQuery = (queryParam || lastQuery).trim()
                if (activeQuery) {
                    runContentSearch(activeQuery, semanticWeight, next)
                }
            }

            return next
        })
    }, [lastQuery, queryMode, queryParam, runContentSearch, semanticWeight, updateTypesInUrl])

    const handleClearAll = useCallback(() => {
        setQueryMode('filename')
        setQueryInput('')
        setSemanticWeight(0.5)
        setSelectedFileTypes([])
        setSelectedResult(null)
        setBatchScanStatus('idle')

        clearResults()
        browse.clearFilters()

        const next = new URLSearchParams(searchParams)
        next.delete('q')
        next.delete('types')
        next.delete('date')
        setSearchParams(next, { replace: true })
    }, [browse, clearResults, searchParams, setSearchParams])

    const formatChipDate = useCallback((iso?: string | null) => {
        if (!iso) return ''
        try {
            const d = new Date(iso)
            return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            })
        } catch {
            return iso
        }
    }, [locale])

    const FILE_TYPE_CONFIG: { type: FileType; label: string; icon: React.ElementType; color: string }[] = [
        { type: 'pdf', label: 'PDF', icon: FileText, color: 'text-red-500' },
        { type: 'image', label: t('scans.images'), icon: Image, color: 'text-blue-500' },
        { type: 'text', label: t('scans.text'), icon: FileType2, color: 'text-green-500' },
        { type: 'video', label: t('scans.videos'), icon: Video, color: 'text-purple-500' },
        { type: 'email', label: 'Email', icon: FileType2, color: 'text-amber-500' },
        { type: 'unknown', label: t('browse.otherTypes'), icon: FileType2, color: 'text-muted-foreground' },
    ]

    const DATE_PRESETS = [
        { label: t('browse.today'), days: 0 },
        { label: t('browse.last7Days'), days: 7 },
        { label: t('browse.last30Days'), days: 30 },
        { label: t('browse.thisYear'), days: 365 },
    ]

    const SORT_OPTIONS: { value: SortBy; label: string }[] = [
        { value: 'indexed_desc', label: t('browse.sortIndexedDesc') },
        { value: 'indexed_asc', label: t('browse.sortIndexedAsc') },
        { value: 'modified_desc', label: t('browse.sortModifiedDesc') },
        { value: 'modified_asc', label: t('browse.sortModifiedAsc') },
        { value: 'name_asc', label: t('browse.sortNameAsc') },
        { value: 'name_desc', label: t('browse.sortNameDesc') },
        { value: 'size_desc', label: t('browse.sortSizeDesc') },
        { value: 'size_asc', label: t('browse.sortSizeAsc') },
    ]

    const handleDatePreset = (days: number) => {
        if (days === 0) {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            browse.setDateRange(today.toISOString(), undefined)
        } else {
            browse.setDateRange(getDateFromDays(days), undefined)
        }
    }

    const browseResultsAsSearchResults: SearchResult[] = browse.documents.map((doc) => ({
        document_id: doc.id,
        file_path: doc.file_path,
        file_name: doc.file_name,
        file_type: doc.file_type,
        score: 0,
        from_meilisearch: false,
        from_qdrant: false,
        meilisearch_rank: null,
        qdrant_rank: null,
        snippet: null,
        highlights: [],
    }))

    const currentSortLabel = SORT_OPTIONS.find((option) => option.value === browse.filters.sort_by)?.label ?? t('browse.sortLabel')
    const currentSkip = browse.filters.skip ?? 0
    const currentLimit = browse.filters.limit ?? 50
    const activeContentQuery = (queryParam || (queryMode === 'content' ? lastQuery : '')).trim()
    const isContentSearchActive = queryMode === 'content' && Boolean(activeContentQuery)

    const hasActiveFilters = Boolean(
        selectedFileTypes.length > 0
        || browse.filters.date_from
        || browse.filters.date_to
        || (queryMode === 'filename' && queryInput.trim())
    )
    const activeFilterCount =
        selectedFileTypes.length
        + ((browse.filters.date_from || browse.filters.date_to) ? 1 : 0)
        + ((queryMode === 'filename' && queryInput.trim()) ? 1 : 0)

    const activeChips = useMemo(() => {
        const chips: Array<{ key: string; label: string; onRemove: () => void }> = []

        const filenameQuery = queryMode === 'filename' ? queryInput.trim() : ''
        if (filenameQuery) {
            chips.push({
                key: `q:filename:${filenameQuery}`,
                label: `${t('browse.filterName')}: ${filenameQuery}`,
                onRemove: () => {
                    setQueryInput('')
                    browse.updateFilters({ search: undefined })
                },
            })
        }

        const contentQuery = queryMode === 'content' ? activeContentQuery : ''
        if (contentQuery) {
            chips.push({
                key: `q:content:${contentQuery}`,
                label: `${t('home.search')}: ${contentQuery}`,
                onRemove: () => {
                    setQueryInput('')
                    handleQueryModeChange('filename')
                },
            })
        }

        for (const type of selectedFileTypes) {
            const label = FILE_TYPE_CONFIG.find((cfg) => cfg.type === type)?.label ?? type
            chips.push({
                key: `type:${type}`,
                label,
                onRemove: () => handleToggleFileType(type),
            })
        }

        if (browse.filters.date_from || browse.filters.date_to) {
            const from = formatChipDate(browse.filters.date_from)
            const to = formatChipDate(browse.filters.date_to)
            const label = from && to
                ? `${t('browse.dateLabel')}: ${from} → ${to}`
                : from
                    ? `${t('browse.dateLabel')}: ≥ ${from}`
                    : to
                        ? `${t('browse.dateLabel')}: ≤ ${to}`
                        : t('browse.dateLabel')

            chips.push({
                key: 'date',
                label,
                onRemove: () => browse.setDateRange(undefined, undefined),
            })
        }

        return chips
    }, [
        FILE_TYPE_CONFIG,
        activeContentQuery,
        browse.filters.date_from,
        browse.filters.date_to,
        browse.setDateRange,
        browse.updateFilters,
        formatChipDate,
        handleQueryModeChange,
        handleToggleFileType,
        queryInput,
        queryMode,
        selectedFileTypes,
        t,
    ])

    const usesBrowseDataset = !isContentSearchActive
    const listResults = usesBrowseDataset ? browseResultsAsSearchResults : results
    const listTotalResults = usesBrowseDataset ? browse.total : totalResults
    const listProcessingTime = usesBrowseDataset ? 0 : processingTime
    const listIsLoading = usesBrowseDataset ? browse.isLoading : isLoading
    const listMode: 'search' | 'browse' = usesBrowseDataset ? 'browse' : 'search'

    const selectedDocumentId = selectedResult?.document_id ?? null
    const currentViewerResults = listResults
    const currentViewerIndex = selectedDocumentId
        ? currentViewerResults.findIndex((result) => result.document_id === selectedDocumentId)
        : -1
    const canNavigatePrevious = currentViewerIndex > 0
    const canNavigateNext = currentViewerIndex >= 0 && currentViewerIndex < currentViewerResults.length - 1
    const canNavigatePreviousForViewer =
        canNavigatePrevious || (usesBrowseDataset && currentViewerIndex === 0 && currentSkip > 0)
    const canNavigateNextForViewer =
        canNavigateNext
        || (currentViewerIndex >= 0 && (
            usesBrowseDataset
                ? (currentViewerIndex === currentViewerResults.length - 1 && currentSkip + currentLimit < browse.total)
                : (currentViewerIndex === currentViewerResults.length - 1 && hasMore)
        ))

    const navigateToPreviousDocument = useCallback(() => {
        if (currentViewerIndex < 0) return

        if (canNavigatePrevious) {
            setSelectedResult(currentViewerResults[currentViewerIndex - 1] ?? null)
            return
        }

        if (pendingViewerSelectionRef.current) return
        if (!usesBrowseDataset) return
        if (currentSkip <= 0) return

        pendingViewerSelectionRef.current = { kind: 'edge', edge: 'last' }
        browse.prevPage()
    }, [
        browse.prevPage,
        canNavigatePrevious,
        currentSkip,
        currentViewerIndex,
        currentViewerResults,
        usesBrowseDataset,
    ])

    const navigateToNextDocument = useCallback(() => {
        if (currentViewerIndex < 0) return

        if (canNavigateNext) {
            setSelectedResult(currentViewerResults[currentViewerIndex + 1] ?? null)
            return
        }

        if (pendingViewerSelectionRef.current) return

        if (usesBrowseDataset) {
            if (currentSkip + currentLimit >= browse.total) return
            pendingViewerSelectionRef.current = { kind: 'edge', edge: 'first' }
            browse.nextPage()
            return
        }

        if (!hasMore) return
        pendingViewerSelectionRef.current = { kind: 'index', index: currentViewerIndex + 1 }
        loadMore()
    }, [
        browse.nextPage,
        browse.total,
        canNavigateNext,
        currentLimit,
        currentSkip,
        currentViewerIndex,
        currentViewerResults,
        hasMore,
        loadMore,
        usesBrowseDataset,
    ])

    useEffect(() => {
        if (listResults.length === 0) {
            if (selectedResult) setSelectedResult(null)
            return
        }

        const pending = pendingViewerSelectionRef.current
        if (pending) {
            if (pending.kind === 'edge') {
                pendingViewerSelectionRef.current = null
                setSelectedResult(pending.edge === 'first' ? listResults[0] : listResults[listResults.length - 1])
                return
            }

            // Wait for pagination to append more results, then select the requested index.
            if (pending.index >= 0 && pending.index < listResults.length) {
                pendingViewerSelectionRef.current = null
                setSelectedResult(listResults[pending.index])
                return
            }

            if (!isLoadingMore) {
                // Nothing got appended (or request failed). Clear pending so the user can retry.
                pendingViewerSelectionRef.current = null
            }
            return
        }

        if (requestedDocId) {
            const requested = listResults.find((result) => result.document_id === requestedDocId)
            if (requested) {
                if (selectedResult?.document_id !== requested.document_id) {
                    setSelectedResult(requested)
                }
                return
            }
            if (selectedResult?.document_id === requestedDocId) {
                return
            }
        }

        if (!selectedResult) {
            setSelectedResult(listResults[0])
            return
        }

        if (!listResults.some((result) => result.document_id === selectedResult.document_id)) {
            setSelectedResult(listResults[0])
        }
    }, [isLoadingMore, listResults, requestedDocId, selectedResult])

    // If the URL targets a specific document while we're in grid mode, automatically open the viewer.
    useEffect(() => {
        if (!requestedDocId) return
        if (documentsLayout === 'split') return
        setDocumentsLayout('split')
    }, [documentsLayout, requestedDocId])

    // Keep `?doc=` in sync with the visible viewer document when split mode is active.
    useEffect(() => {
        if (documentsLayout !== 'split') return
        if (!selectedDocumentId) return
        const desired = String(selectedDocumentId)
        const current = searchParams.get('doc')
        if (current === desired) return
        const next = new URLSearchParams(searchParams)
        next.set('doc', desired)
        setSearchParams(next, { replace: true })
    }, [documentsLayout, searchParams, selectedDocumentId, setSearchParams])

    // Support deep-linking from gallery (`/?doc=123`) even if the doc is outside current page slice.
    useEffect(() => {
        if (!requestedDocId) return
        if (listResults.some((result) => result.document_id === requestedDocId)) return

        let cancelled = false
        getDocument(requestedDocId)
            .then((doc) => {
                if (cancelled) return
                setSelectedResult({
                    document_id: doc.id,
                    file_path: doc.file_path,
                    file_name: doc.file_name,
                    file_type: doc.file_type,
                    score: 0,
                    from_meilisearch: false,
                    from_qdrant: false,
                    meilisearch_rank: null,
                    qdrant_rank: null,
                    snippet: null,
                    highlights: [],
                })
            })
            .catch(() => {
                // Ignore invalid deep-links.
            })

        return () => {
            cancelled = true
        }
    }, [listResults, requestedDocId])

    const PAGE_SIZE_OPTIONS = usesBrowseDataset ? [50, 100, 200] : [20, 50, 100]
    const currentPageSize = usesBrowseDataset ? (browse.filters.limit ?? 50) : searchPageSize

    const handlePageSizeChange = useCallback((nextSize: number) => {
        const size = Math.max(1, nextSize)
        if (usesBrowseDataset) {
            browse.updateFilters({ limit: Math.min(200, size) })
            return
        }
        setSearchPageSize(Math.min(100, size))
        if (queryMode === 'content') {
            const activeQuery = (queryParam || lastQuery).trim()
            if (activeQuery) {
                runContentSearch(activeQuery, semanticWeight, selectedFileTypes, Math.min(100, size))
            }
        }
    }, [
        browse.updateFilters,
        lastQuery,
        queryMode,
        queryParam,
        runContentSearch,
        semanticWeight,
        selectedFileTypes,
        usesBrowseDataset,
    ])

    if (statsLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="animate-pulse text-muted-foreground">{t('home.loading')}</div>
            </div>
        )
    }

    if (!hasDocuments) {
        return <EmptyState onStartScan={handleStartScan} />
    }

    return (
        <PanelGroup key={`${documentsLayout}-${isSidebarVisible ? 'sidebar' : 'nosidebar'}`} direction="horizontal" className="h-full">
            <Panel
                defaultSize={documentsLayout === 'grid' ? 100 : 50}
                minSize={35}
                maxSize={documentsLayout === 'grid' ? 100 : 65}
            >
                <PanelGroup direction="horizontal" className="h-full">
                    {isSidebarVisible && (
                        <>
                            <Panel defaultSize={34} minSize={24} maxSize={45}>
                                <div className="h-full flex flex-col border-r bg-card/20">
                                    <div className="p-3 border-b bg-card/40">
                                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('home.search')} & {t('browse.title')}</p>
                                        <p className="text-sm font-semibold mt-1">{selectedProject?.name}</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {browse.total.toLocaleString()} {t('common.documents')}
                                        </p>
                                    </div>

                                    <div className="flex-1 overflow-auto p-3 space-y-3">
                                        <section className="rounded-lg border bg-card/40 p-3 space-y-3">
                                            <div className="inline-flex w-full rounded-md bg-muted p-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleQueryModeChange('filename')}
                                                    className={cn(
                                                        'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                                                        queryMode === 'filename'
                                                            ? 'bg-background text-foreground shadow-sm'
                                                            : 'text-muted-foreground hover:text-foreground'
                                                    )}
                                                >
                                                    {t('home.browse')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleQueryModeChange('content')}
                                                    className={cn(
                                                        'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                                                        queryMode === 'content'
                                                            ? 'bg-background text-foreground shadow-sm'
                                                            : 'text-muted-foreground hover:text-foreground'
                                                    )}
                                                >
                                                    {t('home.search')}
                                                </button>
                                            </div>

                                            <form onSubmit={handleSubmit} className="space-y-2">
                                                <div className="relative">
                                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                                    <Input
                                                        placeholder={
                                                            queryMode === 'content'
                                                                ? t('searchBar.placeholder')
                                                                : t('browse.searchPlaceholder')
                                                        }
                                                        value={queryInput}
                                                        onChange={(e) => setQueryInput(e.target.value)}
                                                        className="pl-8 h-9 text-sm"
                                                    />
                                                </div>
                                                <Button type="submit" size="sm" className="w-full gap-1.5" disabled={queryMode === 'content' && isLoading}>
                                                    {queryMode === 'content' ? <Sparkles className="h-3.5 w-3.5" /> : <Filter className="h-3.5 w-3.5" />}
                                                    {queryMode === 'content' ? t('searchBar.search') : t('browse.title')}
                                                </Button>
                                            </form>

                                            {queryMode === 'content' && (
                                                <div className="space-y-2">
                                                    <p className="text-[11px] text-muted-foreground">{t('searchBar.semantic')}</p>
                                                    <div className="grid grid-cols-3 gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant={semanticWeight === 0 ? 'default' : 'outline'}
                                                            className="h-7 text-[11px]"
                                                            onClick={() => handleSemanticModeChange(0)}
                                                        >
                                                            <Zap className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant={semanticWeight === 0.5 ? 'default' : 'outline'}
                                                            className="h-7 text-[11px]"
                                                            onClick={() => handleSemanticModeChange(0.5)}
                                                        >
                                                            {t('searchBar.hybrid')}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant={semanticWeight === 1 ? 'default' : 'outline'}
                                                            className="h-7 text-[11px]"
                                                            onClick={() => handleSemanticModeChange(1)}
                                                        >
                                                            <Sparkles className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </section>

                                <section className="rounded-lg border bg-card/40 p-3 space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">{t('searchBar.filterByType')}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Button
                                            variant={selectedFileTypes.length === 0 ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-7 text-[11px]"
                                            onClick={() => {
                                                setSelectedFileTypes([])
                                                updateTypesInUrl([])
                                                if (queryMode === 'content' && activeContentQuery) {
                                                    runContentSearch(activeContentQuery, semanticWeight, [])
                                                }
                                            }}
                                        >
                                            {t('searchBar.allTypes')}
                                            <span className="text-[10px] tabular-nums opacity-75">
                                                ({browse.total.toLocaleString()})
                                            </span>
                                        </Button>
                                        {FILE_TYPE_CONFIG.map(({ type, label, icon: Icon, color }) => {
                                            const isActive = selectedFileTypes.includes(type)
                                            const typeCount = fileTypeCounts[type] ?? 0
                                            return (
                                                <Button
                                                    key={type}
                                                    variant={isActive ? 'default' : 'outline'}
                                                    size="sm"
                                                    className="h-7 text-[11px] gap-1"
                                                    onClick={() => handleToggleFileType(type)}
                                                >
                                                    <Icon className={cn('h-3 w-3', !isActive && color)} />
                                                    {label}
                                                    <span className="text-[10px] tabular-nums opacity-75">
                                                        ({typeCount.toLocaleString()})
                                                    </span>
                                                </Button>
                                            )
                                        })}
                                    </div>
                                </section>

                                <section className="rounded-lg border bg-card/40 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-medium text-muted-foreground">{t('browse.dateLabel')}</p>
                                        {browse.filters.date_from && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2 text-[11px]"
                                                onClick={() => browse.setDateRange(undefined, undefined)}
                                            >
                                                × {t('browse.clearDate')}
                                            </Button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                        {DATE_PRESETS.map(({ label, days }) => (
                                            <Button
                                                key={days}
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-[11px]"
                                                onClick={() => handleDatePreset(days)}
                                            >
                                                <Calendar className="h-3 w-3 mr-1" />
                                                {label}
                                            </Button>
                                        ))}
                                    </div>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="sm" className="w-full justify-start gap-1 h-7 text-[11px]">
                                                <SortDesc className="h-3 w-3" />
                                                {currentSortLabel}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start">
                                            {SORT_OPTIONS.map(({ value, label }) => (
                                                <DropdownMenuItem
                                                    key={value}
                                                    onClick={() => browse.setSortBy(value)}
                                                    className={cn(browse.filters.sort_by === value && 'bg-accent')}
                                                >
                                                    {label}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </section>

                                {queryMode === 'content' && activeContentQuery && !isLoading && totalResults > 0 && totalResults <= 20 && (
                                    <section className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                            disabled={batchScanStatus === 'loading' || batchScanStatus === 'triggered'}
                                            onClick={async () => {
                                                setBatchScanStatus('loading')
                                                try {
                                                    const ids = results.map((r) => r.document_id)
                                                    const resp = await triggerBatchDeepAnalysis(ids)
                                                    setBatchScanStatus(resp.status === 'all_completed' ? 'complete' : 'triggered')
                                                } catch {
                                                    setBatchScanStatus('idle')
                                                }
                                            }}
                                        >
                                            {batchScanStatus === 'loading' ? t('deepAnalysis.scanning') :
                                                batchScanStatus === 'triggered' ? t('deepAnalysis.batchTriggered').replace('{count}', String(totalResults)) :
                                                    batchScanStatus === 'complete' ? t('deepAnalysis.batchComplete') :
                                                        t('deepAnalysis.advancedScan')}
                                        </Button>
                                    </section>
                                )}

                                {(error || loadMoreError) && (
                                    <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-2">
                                        {error && (
                                            <div className="flex items-center justify-between gap-2">
                                                <span>{error}</span>
                                                <Button variant="outline" size="sm" onClick={retry} className="h-7 px-2">
                                                    {t('home.retry')}
                                                </Button>
                                            </div>
                                        )}
                                        {loadMoreError && <p>{t('common.loadMoreError')}</p>}
                                    </section>
                                )}

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearAll}
                                    className="w-full h-8 text-xs text-muted-foreground"
                                >
                                    {t('browse.clearFilters')}
                                </Button>
                                    </div>
                                </div>
                            </Panel>

                            <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />
                        </>
                    )}

                    <Panel defaultSize={isSidebarVisible ? 66 : 100} minSize={45}>
                        <div className="h-full flex flex-col">
                            <div className="shrink-0 px-3 py-2 border-b bg-card/30 text-xs text-muted-foreground flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="truncate">
                                        {usesBrowseDataset
                                            ? `${browse.total.toLocaleString()} ${t('common.documents')}`
                                            : `${totalResults.toLocaleString()} ${t('stats.searchResults')} · “${activeContentQuery}”`
                                        }
                                    </span>
                                    {usesBrowseDataset && hasActiveFilters && (
                                        <span className="text-[11px] text-primary whitespace-nowrap">
                                            {t('browse.activeFilters').replace('{count}', String(activeFilterCount))}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button
                                        variant={isSidebarVisible ? 'default' : 'outline'}
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={() => setIsSidebarVisible((prev) => !prev)}
                                        title={t('cockpit.filters')}
                                        aria-label={t('cockpit.filters')}
                                        aria-pressed={isSidebarVisible}
                                    >
                                        <Filter className="h-3.5 w-3.5" />
                                    </Button>
                                    {documentsLayout === 'grid' && (
                                        <>
                                            <div className="hidden lg:flex items-center gap-2 w-40">
                                                <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
                                                <Slider
                                                    value={[gridThumbnailSize]}
                                                    onValueChange={([v]: number[]) => setGridThumbnailSize(v)}
                                                    min={80}
                                                    max={300}
                                                    step={20}
                                                    className="w-24"
                                                />
                                                <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
                                            </div>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
                                                        {currentPageSize} / {t('common.page')}
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {PAGE_SIZE_OPTIONS.map((size) => (
                                                        <DropdownMenuItem
                                                            key={size}
                                                            onClick={() => handlePageSizeChange(size)}
                                                            className={cn(size === currentPageSize && 'bg-accent')}
                                                        >
                                                            {size} / {t('common.page')}
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </>
                                    )}

                                    <div className="flex items-center border rounded-md bg-muted/20 p-0.5">
                                        <Button
                                            variant={documentsLayout === 'grid' ? 'default' : 'ghost'}
                                            size="sm"
                                            className="h-7 px-2"
                                            onClick={handleLayoutGrid}
                                            title="Vue grille"
                                        >
                                            <LayoutGrid className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant={documentsLayout === 'split' ? 'default' : 'ghost'}
                                            size="sm"
                                            className="h-7 px-2"
                                            onClick={handleLayoutSplit}
                                            title="Vue details"
                                        >
                                            <Columns2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {activeChips.length > 0 && (
                                <div className="shrink-0 px-3 py-2 border-b bg-card/20">
                                    <div className="flex flex-wrap gap-1.5">
                                        {activeChips.map((chip) => (
                                            <Button
                                                key={chip.key}
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-6 px-2 text-[11px] font-medium gap-1"
                                                onClick={chip.onRemove}
                                                title={t('browse.removeFilter')}
                                            >
                                                <X className="h-3 w-3 opacity-70" />
                                                <span className="max-w-[320px] truncate">{chip.label}</span>
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-hidden">
                                {documentsLayout === 'grid' ? (
                                    <ResultGrid
                                        results={listResults}
                                        selectedId={selectedResult?.document_id ?? null}
                                        onSelect={openResultInSplitView}
                                        totalResults={listTotalResults}
                                        isLoading={listIsLoading}
                                        mode={listMode}
                                        hasActiveFilters={hasActiveFilters}
                                        thumbnailSize={gridThumbnailSize}
                                        onLoadMore={!usesBrowseDataset ? loadMore : undefined}
                                        hasMore={!usesBrowseDataset ? hasMore : false}
                                        isLoadingMore={!usesBrowseDataset ? isLoadingMore : false}
                                    />
                                ) : (
                                    <ResultList
                                        results={listResults}
                                        selectedId={selectedResult?.document_id ?? null}
                                        onSelect={handleSelectResult}
                                        totalResults={listTotalResults}
                                        processingTime={listProcessingTime}
                                        isLoading={listIsLoading}
                                        mode={listMode}
                                        hasActiveFilters={hasActiveFilters}
                                        onLoadMore={!usesBrowseDataset ? loadMore : undefined}
                                        hasMore={!usesBrowseDataset ? hasMore : false}
                                        isLoadingMore={!usesBrowseDataset ? isLoadingMore : false}
                                    />
                                )}
                            </div>

                            {usesBrowseDataset && browse.total > currentLimit && (
                                <div className="shrink-0 px-3 py-2 border-t bg-card/30 flex items-center justify-between text-sm">
                                    <span className="text-xs text-muted-foreground">
                                        {currentSkip + 1}–{Math.min(currentSkip + currentLimit, browse.total)} {t('home.of')} {browse.total.toLocaleString()}
                                    </span>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={browse.prevPage}
                                            disabled={currentSkip === 0}
                                            className="h-7 w-7 p-0"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={browse.nextPage}
                                            disabled={currentSkip + currentLimit >= browse.total}
                                            className="h-7 w-7 p-0"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Panel>
                </PanelGroup>
            </Panel>

            {documentsLayout === 'split' && (
                <>
                    <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

                    <Panel defaultSize={50} minSize={35}>
                        <div className="h-full bg-card/20">
                            <DocumentViewer
                                documentId={selectedDocumentId}
                                searchQuery={isContentSearchActive ? activeContentQuery : undefined}
                                onNavigatePrevious={navigateToPreviousDocument}
                                onNavigateNext={navigateToNextDocument}
                                canNavigatePrevious={canNavigatePreviousForViewer}
                                canNavigateNext={canNavigateNextForViewer}
                            />
                        </div>
                    </Panel>
                </>
            )}
        </PanelGroup>
    )
}
