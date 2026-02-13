import { useState, useCallback, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Search, FileText, Image, FileType2, Calendar, SortDesc, X, ChevronLeft, ChevronRight, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { ResultList } from '@/components/search/ResultList'
import { useBrowse } from '@/hooks/useBrowse'
import { useTranslation } from '@/contexts/I18nContext'
import { useProject } from '@/contexts/ProjectContext'
import { SearchResult, FileType, SortBy } from '@/lib/api'
import { cn } from '@/lib/utils'
import { getDateFromDays, getDateRangeFromParam } from '@/lib/dateRange'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function BrowsePage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const queryParam = searchParams.get('q')
    const dateParam = searchParams.get('date')
    const browse = useBrowse()
    const { t } = useTranslation()
    const { selectedProject } = useProject()
    const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null)
    const [searchInput, setSearchInput] = useState('')

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

    useEffect(() => {
        if (queryParam === null) return

        const normalizedQuery = queryParam.trim()
        setSearchInput(normalizedQuery)
        if ((browse.filters.search ?? '') !== normalizedQuery) {
            browse.updateFilters({ search: normalizedQuery || undefined })
        }
    }, [queryParam, browse.updateFilters])

    useEffect(() => {
        if (!dateParam) return

        const range = getDateRangeFromParam(dateParam)
        if (range) {
            browse.setDateRange(range.from, range.to)
        }
    }, [dateParam, browse.setDateRange])

    useEffect(() => {
        const normalizedQuery = searchInput.trim()
        const debounce = setTimeout(() => {
            const currentQuery = browse.filters.search ?? ''
            if (normalizedQuery !== currentQuery) {
                browse.updateFilters({ search: normalizedQuery || undefined })
            }
        }, 250)

        return () => clearTimeout(debounce)
    }, [searchInput, browse.filters.search, browse.updateFilters])

    const handleSelectResult = useCallback((result: SearchResult) => {
        setSelectedDocumentId(result.document_id)
    }, [])

    const handleSearchSubmit = useCallback(() => {
        const normalizedQuery = searchInput.trim()
        if ((browse.filters.search ?? '') !== normalizedQuery) {
            browse.updateFilters({ search: normalizedQuery || undefined })
        }
    }, [searchInput, browse])

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearchSubmit()
        }
    }, [handleSearchSubmit])

    const handleClearSearch = useCallback(() => {
        setSearchInput('')
        browse.updateFilters({ search: undefined })
    }, [browse])

    const handleDatePreset = (days: number) => {
        if (days === 0) {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            browse.setDateRange(today.toISOString(), undefined)
        } else {
            browse.setDateRange(getDateFromDays(days), undefined)
        }
    }

    // Convert browse documents to SearchResult-like format for ResultList
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
    const activeFilterCount = activeFileTypes.length + (browse.filters.date_from ? 1 : 0) + (browse.filters.search ? 1 : 0)
    const showProjectOnboarding = !browse.isLoading && browse.total === 0 && !hasActiveFilters
    const currentSortLabel = SORT_OPTIONS.find(o => o.value === browse.filters.sort_by)?.label ?? t('browse.sortLabel')
    const currentSkip = browse.filters.skip ?? 0
    const currentLimit = browse.filters.limit ?? 50
    const projectName = selectedProject?.name ?? ''
    const onboardingDescription = selectedProject
        ? t('browse.emptyProjectDescription').replace('{project}', projectName)
        : t('browse.emptyNoProjectDescription')

    const contextLine = hasActiveFilters
        ? t('browse.contextLineWithFilters')
            .replace('{project}', projectName || t('browse.title'))
            .replace('{count}', String(browse.total))
            .replace('{filters}', String(activeFilterCount))
        : t('browse.contextLine')
            .replace('{project}', projectName || t('browse.title'))
            .replace('{count}', String(browse.total))

    const selectedBrowseIndex = selectedDocumentId
        ? browseResultsAsSearchResults.findIndex((result) => result.document_id === selectedDocumentId)
        : -1
    const canNavigatePrevious = selectedBrowseIndex > 0
    const canNavigateNext = selectedBrowseIndex >= 0 && selectedBrowseIndex < browseResultsAsSearchResults.length - 1

    const navigateToPreviousDocument = useCallback(() => {
        if (!canNavigatePrevious) return
        setSelectedDocumentId(browseResultsAsSearchResults[selectedBrowseIndex - 1]?.document_id ?? null)
    }, [browseResultsAsSearchResults, canNavigatePrevious, selectedBrowseIndex])

    const navigateToNextDocument = useCallback(() => {
        if (!canNavigateNext) return
        setSelectedDocumentId(browseResultsAsSearchResults[selectedBrowseIndex + 1]?.document_id ?? null)
    }, [browseResultsAsSearchResults, canNavigateNext, selectedBrowseIndex])

    return (
        <div className="h-full flex flex-col">
            {/* Context line */}
            <div className="px-4 py-1.5 border-b bg-muted/20 text-xs text-muted-foreground">
                {contextLine}
            </div>
            {/* Top Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b bg-card/30">
                {/* Search Input */}
                <div className="relative flex items-center gap-2">
                    <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder={t('browse.searchPlaceholder')}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                        className="pl-8 pr-8 h-8 w-56 text-sm"
                    />
                    {searchInput && (
                        <button
                            onClick={handleClearSearch}
                            className="absolute right-2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleSearchSubmit} className="h-8">
                        {t('searchBar.search')}
                    </Button>
                </div>

                <div className="w-px h-6 bg-border mx-1" />

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
                                className={cn("gap-1.5 h-8", isActive && "bg-primary")}
                            >
                                <Icon className={cn("h-3.5 w-3.5", !isActive && color)} />
                                <span>{label}</span>
                            </Button>
                        )
                    })}
                </div>

                <div className="w-px h-6 bg-border mx-1" />

                {/* Date Presets */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{browse.filters.date_from ? t('browse.periodActive') : t('browse.dateLabel')}</span>
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

                {/* Sort Options */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 h-8">
                            <SortDesc className="h-3.5 w-3.5" />
                            <span>{currentSortLabel}</span>
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

                {/* Clear Filters */}
                {hasActiveFilters && (
                    <>
                        <div className="w-px h-6 bg-border mx-1" />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { browse.clearFilters(); setSearchInput('') }}
                            className="h-8 text-muted-foreground hover:text-foreground"
                        >
                            × {t('browse.clearFilters')}
                        </Button>
                    </>
                )}

                {hasActiveFilters && (
                    <div className="text-xs text-muted-foreground">
                        {t('browse.activeFilters').replace('{count}', String(activeFilterCount))}
                    </div>
                )}

                {/* Total count */}
                <div className="ml-auto text-xs text-muted-foreground font-data">
                    {browse.total.toLocaleString()} {t('common.documents')}
                </div>
            </div>

            {showProjectOnboarding ? (
                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="max-w-xl w-full rounded-xl border bg-card/40 p-8 text-center space-y-4">
                        <h2 className="text-xl font-semibold">{t('browse.emptyProjectTitle')}</h2>
                        <p className="text-sm text-muted-foreground">{onboardingDescription}</p>
                        <div className="flex items-center justify-center gap-2">
                            <Button onClick={() => navigate('/scans')}>
                                {t('browse.startScan')}
                            </Button>
                            <Button variant="outline" onClick={() => navigate('/projects')}>
                                {t('browse.changeProject')}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                /* Main Content - 2 panels */
                <PanelGroup direction="horizontal" className="flex-1 min-h-0">
                    {/* Left Panel - Document List */}
                    <Panel defaultSize={40} minSize={25} maxSize={60}>
                        <div className="flex flex-col h-full border-r">
                            {/* Results */}
                            <div className="flex-1 overflow-hidden">
                                <ResultList
                                    results={browseResultsAsSearchResults}
                                    selectedId={selectedDocumentId}
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
                                <div className="px-3 py-2 border-t bg-card/30 flex items-center justify-between text-sm">
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

                    <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

                    {/* Right Panel - Document Viewer */}
                    <Panel defaultSize={60} minSize={40}>
                        <div className="h-full bg-card/20">
                            <DocumentViewer
                                documentId={selectedDocumentId}
                                onNavigatePrevious={navigateToPreviousDocument}
                                onNavigateNext={navigateToNextDocument}
                                canNavigatePrevious={canNavigatePrevious}
                                canNavigateNext={canNavigateNext}
                            />
                        </div>
                    </Panel>
                </PanelGroup>
            )}
        </div>
    )
}
