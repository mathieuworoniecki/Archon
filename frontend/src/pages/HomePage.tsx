import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { SearchBar, type SearchOptions } from '@/components/search/SearchBar'
import { ResultList } from '@/components/search/ResultList'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchStartPanel } from '@/components/search/SearchStartPanel'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { SearchStatsPanel } from '@/components/search/SearchStatsPanel'
import { EmptyState } from '@/components/ui/EmptyState'
import { useSearch } from '@/hooks/useSearch'
import { useStats } from '@/hooks/useStats'
import { useBrowse } from '@/hooks/useBrowse'
import { SearchResult, FileType, SortBy, triggerBatchDeepAnalysis } from '@/lib/api'
import { useTranslation } from '@/contexts/I18nContext'
import { useProject } from '@/contexts/ProjectContext'
import { cn } from '@/lib/utils'
import { getDateFromDays, getDateRangeFromParam } from '@/lib/dateRange'
import {
    Search, FileText, Image, FileType2, Calendar, SortDesc, X,
    ChevronLeft, ChevronRight, Video, Layers
} from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const RECENT_SEARCHES_KEY = 'archon_recent_searches'
const HOME_MODE_KEY = 'archon_home_mode'

type PageMode = 'search' | 'browse'

export function HomePage() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const queryParam = searchParams.get('q')
    const dateParam = searchParams.get('date')
    const modeParam = searchParams.get('mode') as PageMode | null

    // Search hook
    const { results, totalResults, processingTime, isLoading, isLoadingMore, hasMore, lastQuery, error, loadMoreError, performSearch, loadMore, retry } = useSearch()

    // Browse hook
    const browse = useBrowse()

    const { isLoading: statsLoading, hasDocuments } = useStats()
    const { selectedProject, projects, selectProject } = useProject()
    const { t } = useTranslation()

    // Determine initial mode from URL
    const [mode, setMode] = useState<PageMode>(() => {
        if (modeParam === 'browse' || dateParam) return 'browse'
        const savedMode = localStorage.getItem(HOME_MODE_KEY)
        return savedMode === 'browse' ? 'browse' : 'search'
    })

    const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
    const [batchScanStatus, setBatchScanStatus] = useState<'idle' | 'loading' | 'triggered' | 'complete'>('idle')
    const [browseSearchInput, setBrowseSearchInput] = useState('')

    // ─── Search mode helpers ───
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

    const handleSearch = useCallback(
        (query: string, semanticWeight: number, projectPath?: string, options?: SearchOptions) => {
            const q = query.trim()
            saveRecentSearch(q)
            performSearch(q, {
                semantic_weight: semanticWeight,
                project_path: projectPath,
                file_types: options?.file_types,
            })
            setSelectedResult(null)
            const next = new URLSearchParams(searchParams)
            next.set('q', q)
            if (options?.file_types?.length) next.set('types', options.file_types.join(','))
            else next.delete('types')
            next.delete('mode')
            next.delete('date')
            setSearchParams(next, { replace: true })
        },
        [performSearch, saveRecentSearch, searchParams, setSearchParams]
    )

    // Restore search from URL
    useEffect(() => {
        if (mode !== 'search') return
        if (queryParam === null) return
        const normalizedQuery = queryParam.trim()
        if (!normalizedQuery) return
        if (normalizedQuery === lastQuery) return

        saveRecentSearch(normalizedQuery)
        const typesParam = searchParams.get('types')
        const fileTypes = typesParam ? typesParam.split(',').map((s) => s.trim()).filter(Boolean) : undefined
        performSearch(normalizedQuery, {
            semantic_weight: 0.5,
            project_path: selectedProject?.path,
            file_types: fileTypes?.length ? fileTypes : undefined,
        })
        setSelectedResult(null)
    }, [queryParam, mode, performSearch, saveRecentSearch, selectedProject?.path, searchParams, lastQuery])

    // Keep local mode in sync with URL/back-forward navigation.
    useEffect(() => {
        const urlMode: PageMode = modeParam === 'browse' || !!dateParam ? 'browse' : 'search'
        setMode((prev) => (prev === urlMode ? prev : urlMode))
    }, [dateParam, modeParam])

    useEffect(() => {
        localStorage.setItem(HOME_MODE_KEY, mode)
    }, [mode])

    // ─── Browse mode helpers ───
    // Auto-apply date param from URL
    useEffect(() => {
        if (!dateParam) return
        const range = getDateRangeFromParam(dateParam)
        if (range) {
            setMode('browse')
            browse.setDateRange(range.from, range.to)
        }
    }, [dateParam, browse.setDateRange])

    // Debounced browse search
    useEffect(() => {
        if (mode !== 'browse') return
        const normalizedQuery = browseSearchInput.trim()
        const debounce = setTimeout(() => {
            const currentQuery = browse.filters.search ?? ''
            if (normalizedQuery !== currentQuery) {
                browse.updateFilters({ search: normalizedQuery || undefined })
            }
        }, 250)
        return () => clearTimeout(debounce)
    }, [browseSearchInput, mode, browse.filters.search, browse.updateFilters])

    // ─── Shared callbacks ───
    const handleSelectResult = useCallback((result: SearchResult) => {
        setSelectedResult(result)
    }, [])

    const handleStartScan = useCallback((projectPath?: string) => {
        if (projectPath) {
            const project = projects.find((entry) => entry.path === projectPath)
            if (project) selectProject(project)
        }
        navigate('/scans')
    }, [navigate, projects, selectProject])

    const handleModeChange = useCallback((newMode: PageMode) => {
        setMode(newMode)
        setSelectedResult(null)
        const next = new URLSearchParams(searchParams)
        if (newMode === 'browse') {
            next.set('mode', 'browse')
        } else {
            next.delete('mode')
            next.delete('date')
        }
        setSearchParams(next, { replace: true })
    }, [searchParams, setSearchParams])

    // ─── Browse filter config ───
    const FILE_TYPE_CONFIG: { type: FileType; label: string; icon: React.ElementType; color: string }[] = [
        { type: 'pdf', label: 'PDF', icon: FileText, color: 'text-red-500' },
        { type: 'image', label: t('scans.images'), icon: Image, color: 'text-blue-500' },
        { type: 'text', label: t('scans.text'), icon: FileType2, color: 'text-green-500' },
        { type: 'video', label: t('scans.videos'), icon: Video, color: 'text-purple-500' },
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

    // Convert browse docs to SearchResult shape for ResultList
    const browseResultsAsSearchResults: SearchResult[] = browse.documents.map(doc => ({
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
        highlights: []
    }))

    const activeFileTypes = (browse.filters.file_types ?? []) as FileType[]
    const hasActiveFilters = Boolean(
        activeFileTypes.length > 0 || browse.filters.date_from || browse.filters.date_to || browse.filters.search
    )

    const currentSortLabel = SORT_OPTIONS.find(o => o.value === browse.filters.sort_by)?.label ?? t('browse.sortLabel')
    const currentSkip = browse.filters.skip ?? 0
    const currentLimit = browse.filters.limit ?? 50

    // Get selected document ID for viewer
    const selectedDocumentId = selectedResult?.document_id ?? null

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
        <PanelGroup direction="horizontal" className="h-full">
            {/* Left Panel - Search & Results */}
            <Panel defaultSize={40} minSize={30} maxSize={60}>
                <div className="flex flex-col h-full border-r">
                    {/* Mode Toggle */}
                    <div className="flex items-center border-b bg-card/30">
                        <button
                            onClick={() => handleModeChange('search')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2",
                                mode === 'search'
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Search className="h-3.5 w-3.5" />
                            {t('home.search')}
                        </button>
                        <button
                            onClick={() => handleModeChange('browse')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2",
                                mode === 'browse'
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <Layers className="h-3.5 w-3.5" />
                            {t('home.browse')}
                        </button>
                    </div>

                    {/* ════════ SEARCH MODE ════════ */}
                    {mode === 'search' && (
                        <>
                            <div className="p-4 border-b bg-card/30">
                                <SearchBar
                                    onSearch={handleSearch}
                                    isLoading={isLoading}
                                    disabled={!hasDocuments}
                                    initialQuery={queryParam?.trim() || ''}
                                    initialFileTypes={searchParams.get('types')?.split(',').map((s) => s.trim()).filter(Boolean)}
                                />
                            </div>

                            {lastQuery && error && (
                                <div className="shrink-0 px-4 py-2 bg-destructive/10 text-destructive text-sm flex items-center justify-between gap-2 border-b">
                                    <span>{error}</span>
                                    <Button variant="outline" size="sm" onClick={retry} className="shrink-0">
                                        {t('home.retry')}
                                    </Button>
                                </div>
                            )}

                            {loadMoreError && (
                                <div className="shrink-0 px-4 py-2 bg-amber-500/10 text-amber-500 text-sm flex items-center justify-between gap-2 border-b">
                                    <span>{t('common.loadMoreError')}</span>
                                    <Button variant="outline" size="sm" onClick={loadMore} className="shrink-0">
                                        {t('common.retry')}
                                    </Button>
                                </div>
                            )}

                            {/* Advanced Scan button when ≤ 20 results */}
                            {lastQuery && !isLoading && totalResults > 0 && totalResults <= 20 && (
                                <div className="shrink-0 px-4 py-2 border-b bg-amber-500/5">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                        disabled={batchScanStatus === 'loading' || batchScanStatus === 'triggered'}
                                        onClick={async () => {
                                            setBatchScanStatus('loading')
                                            try {
                                                const ids = results.map(r => r.document_id)
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
                                    {batchScanStatus === 'idle' && (
                                        <p className="text-xs text-muted-foreground mt-1 text-center">
                                            {t('deepAnalysis.advancedScanDesc').replace('{count}', String(totalResults))}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Search Results or Start panel */}
                            <div className="flex-1 overflow-hidden">
                                {!lastQuery && !isLoading ? (
                                    <SearchStartPanel
                                        onSearch={(q) =>
                                            handleSearch(q, 0.5, selectedProject?.path)
                                        }
                                    />
                                ) : (
                                    <ResultList
                                        results={results}
                                        selectedId={selectedResult?.document_id ?? null}
                                        onSelect={handleSelectResult}
                                        totalResults={totalResults}
                                        processingTime={processingTime}
                                        isLoading={isLoading}
                                        onLoadMore={loadMore}
                                        hasMore={hasMore}
                                        isLoadingMore={isLoadingMore}
                                    />
                                )}
                            </div>
                        </>
                    )}

                    {/* ════════ BROWSE MODE ════════ */}
                    {mode === 'browse' && (
                        <>
                            {/* Browse Filter Bar */}
                            <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-card/30">
                                {/* Filter search */}
                                <div className="relative flex items-center">
                                    <Search className="absolute left-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                    <Input
                                        placeholder={t('browse.searchPlaceholder')}
                                        value={browseSearchInput}
                                        onChange={(e) => setBrowseSearchInput(e.target.value)}
                                        className="pl-7 pr-7 h-7 w-40 text-xs"
                                    />
                                    {browseSearchInput && (
                                        <button
                                            onClick={() => { setBrowseSearchInput(''); browse.updateFilters({ search: undefined }) }}
                                            className="absolute right-2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>

                                {/* File Type Chips */}
                                <div className="flex items-center gap-1">
                                    {FILE_TYPE_CONFIG.map(({ type, label, icon: Icon, color }) => {
                                        const isActive = activeFileTypes.includes(type)
                                        return (
                                            <Button
                                                key={type}
                                                variant={isActive ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => browse.toggleFileType(type)}
                                                className={cn("gap-1 h-7 text-[11px] px-2", isActive && "bg-primary")}
                                            >
                                                <Icon className={cn("h-3 w-3", !isActive && color)} />
                                                {label}
                                            </Button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Second filter row — date + sort */}
                            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b bg-card/20">
                                {/* Date Presets */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-1 h-7 text-[11px]">
                                            <Calendar className="h-3 w-3" />
                                            {browse.filters.date_from ? t('browse.periodActive') : t('browse.dateLabel')}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        {DATE_PRESETS.map(({ label, days }) => (
                                            <DropdownMenuItem key={days} onClick={() => handleDatePreset(days)}>
                                                {label}
                                            </DropdownMenuItem>
                                        ))}
                                        {browse.filters.date_from && (
                                            <DropdownMenuItem onClick={() => browse.setDateRange(undefined, undefined)}>
                                                × {t('browse.clearDate')}
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Sort */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-1 h-7 text-[11px]">
                                            <SortDesc className="h-3 w-3" />
                                            {currentSortLabel}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        {SORT_OPTIONS.map(({ value, label }) => (
                                            <DropdownMenuItem
                                                key={value}
                                                onClick={() => browse.setSortBy(value)}
                                                className={cn(browse.filters.sort_by === value && "bg-accent")}
                                            >
                                                {label}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Clear all */}
                                {hasActiveFilters && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => { browse.clearFilters(); setBrowseSearchInput('') }}
                                        className="h-7 text-[11px] text-muted-foreground"
                                    >
                                        × {t('browse.clearFilters')}
                                    </Button>
                                )}

                                {/* Count */}
                                <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                                    {browse.total.toLocaleString()} {t('common.documents')}
                                </span>
                            </div>

                            {/* Browse Results */}
                            <div className="flex-1 overflow-hidden">
                                <ResultList
                                    results={browseResultsAsSearchResults}
                                    selectedId={selectedResult?.document_id ?? null}
                                    onSelect={handleSelectResult}
                                    totalResults={browse.total}
                                    processingTime={0}
                                    isLoading={browse.isLoading}
                                    mode="browse"
                                    hasActiveFilters={hasActiveFilters}
                                />
                            </div>

                            {/* Pagination */}
                            {browse.total > currentLimit && (
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
                        </>
                    )}
                </div>
            </Panel>

            <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

            {/* Right Panel - Document Viewer or Stats */}
            <Panel defaultSize={60} minSize={40}>
                <div className="h-full bg-card/20">
                    {selectedDocumentId ? (
                        <DocumentViewer
                            documentId={selectedDocumentId}
                            searchQuery={mode === 'search' ? lastQuery : undefined}
                        />
                    ) : (
                        <SearchStatsPanel results={results} totalResults={totalResults} lastQuery={lastQuery} />
                    )}
                </div>
            </Panel>
        </PanelGroup>
    )
}
