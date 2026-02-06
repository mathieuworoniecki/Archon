import { useState, useCallback } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Search, FolderOpen } from 'lucide-react'
import { SearchBar } from '@/components/search/SearchBar'
import { ResultList } from '@/components/search/ResultList'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { EmptyState } from '@/components/ui/EmptyState'
import { BrowseFilters } from '@/components/browse/BrowseFilters'
import { TimelineHeatmap } from '@/components/timeline/TimelineHeatmap'
import { EntityFilter } from '@/components/entities/EntityFilter'
import { Button } from '@/components/ui/button'
import { useSearch } from '@/hooks/useSearch'
import { useStats } from '@/hooks/useStats'
import { useBrowse } from '@/hooks/useBrowse'
import { SearchResult, Document, FileType } from '@/lib/api'

type ViewMode = 'search' | 'browse'

export function HomePage() {
    const { results, totalResults, processingTime, isLoading, lastQuery, performSearch } = useSearch()
    const { stats, isLoading: statsLoading, hasDocuments } = useStats()
    const browse = useBrowse()

    const [viewMode, setViewMode] = useState<ViewMode>('search')
    const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)

    const handleSearch = useCallback((query: string, semanticWeight: number, projectPath?: string) => {
        performSearch(query, { semantic_weight: semanticWeight, project_path: projectPath })
        setSelectedResult(null)
    }, [performSearch])

    const handleSelectResult = useCallback((result: SearchResult) => {
        setSelectedResult(result)
        setSelectedDocument(null)
    }, [])

    const handleSelectDocument = useCallback((doc: Document) => {
        setSelectedDocument(doc)
        setSelectedResult(null)
    }, [])

    const handleStartScan = useCallback(() => {
        const scanButton = document.querySelector('[data-scan-trigger]') as HTMLButtonElement
        if (scanButton) {
            scanButton.click()
        }
    }, [])

    // Get selected document ID for viewer
    const selectedDocumentId = selectedResult?.document_id ?? selectedDocument?.id ?? null

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

    if (statsLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="animate-pulse text-muted-foreground">Chargement...</div>
            </div>
        )
    }

    if (!hasDocuments) {
        return <EmptyState onStartScan={handleStartScan} />
    }

    return (
        <PanelGroup direction="horizontal" className="h-full">
            {/* Left Panel - Search/Browse & Results */}
            <Panel defaultSize={40} minSize={30} maxSize={60}>
                <div className="flex flex-col h-full border-r">
                    {/* Mode Toggle */}
                    <div className="p-2 border-b bg-card/30 flex items-center gap-2">
                        <div className="flex items-center rounded-lg border bg-card p-1">
                            <Button
                                variant={viewMode === 'search' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('search')}
                                className="gap-1.5 h-7"
                            >
                                <Search className="h-3.5 w-3.5" />
                                Recherche
                            </Button>
                            <Button
                                variant={viewMode === 'browse' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('browse')}
                                className="gap-1.5 h-7"
                            >
                                <FolderOpen className="h-3.5 w-3.5" />
                                Explorer
                            </Button>
                        </div>
                    </div>

                    {viewMode === 'search' ? (
                        <>
                            {/* Search Bar */}
                            <div className="p-4 border-b bg-card/30">
                                <SearchBar
                                    onSearch={handleSearch}
                                    isLoading={isLoading}
                                    disabled={!hasDocuments}
                                />
                            </div>

                            {/* Timeline Heatmap */}
                            <TimelineHeatmap className="px-4 py-2 border-b" />

                            {/* Entity Filter */}
                            <EntityFilter className="px-4 py-2 border-b" />

                            {/* Search Results */}
                            <div className="flex-1 overflow-hidden">
                                <ResultList
                                    results={results}
                                    selectedId={selectedResult?.document_id ?? null}
                                    onSelect={handleSelectResult}
                                    totalResults={totalResults}
                                    processingTime={processingTime}
                                    isLoading={isLoading}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Browse Filters */}
                            <BrowseFilters
                                activeFileTypes={(browse.filters.file_types ?? []) as FileType[]}
                                sortBy={browse.filters.sort_by ?? 'indexed_desc'}
                                dateRange={{
                                    from: browse.filters.date_from,
                                    to: browse.filters.date_to
                                }}
                                onToggleFileType={browse.toggleFileType}
                                onSetDateRange={browse.setDateRange}
                                onSetSortBy={browse.setSortBy}
                                onClear={browse.clearFilters}
                                documentsByType={stats?.documents_by_type}
                            />

                            {/* Browse Results */}
                            <div className="flex-1 overflow-hidden">
                                <ResultList
                                    results={browseResultsAsSearchResults}
                                    selectedId={selectedDocument?.id ?? null}
                                    onSelect={(result) => {
                                        const doc = browse.documents.find(d => d.id === result.document_id)
                                        if (doc) handleSelectDocument(doc)
                                    }}
                                    totalResults={browse.total}
                                    processingTime={0}
                                    isLoading={browse.isLoading}
                                />
                            </div>

                            {/* Pagination */}
                            {browse.total > (browse.filters.limit ?? 50) && (
                                <div className="p-3 border-t bg-card/30 flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">
                                        {(browse.filters.skip ?? 0) + 1}-{Math.min((browse.filters.skip ?? 0) + (browse.filters.limit ?? 50), browse.total)} sur {browse.total}
                                    </span>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={browse.prevPage}
                                            disabled={(browse.filters.skip ?? 0) === 0}
                                        >
                                            Précédent
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={browse.nextPage}
                                            disabled={(browse.filters.skip ?? 0) + (browse.filters.limit ?? 50) >= browse.total}
                                        >
                                            Suivant
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </Panel>

            <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

            {/* Right Panel - Document Viewer */}
            <Panel defaultSize={60} minSize={40}>
                <div className="h-full bg-card/20">
                    <DocumentViewer
                        documentId={selectedDocumentId}
                        searchQuery={viewMode === 'search' ? lastQuery : undefined}
                    />
                </div>
            </Panel>
        </PanelGroup>
    )
}
