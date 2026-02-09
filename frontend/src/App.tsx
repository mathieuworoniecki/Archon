import { useState, useCallback } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Shield, Github, Activity, FileText, Search, FolderOpen, FolderSearch } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SearchBar } from '@/components/search/SearchBar'
import { ResultList } from '@/components/search/ResultList'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { EmptyState } from '@/components/ui/EmptyState'
import { BrowseFilters } from '@/components/browse/BrowseFilters'
import { Button } from '@/components/ui/button'
import { useSearch } from '@/hooks/useSearch'
import { useStats } from '@/hooks/useStats'
import { useBrowse } from '@/hooks/useBrowse'
import { SearchResult, Document, FileType } from '@/lib/api'

type ViewMode = 'search' | 'browse'

function App() {
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

    const formatDocumentCount = (count: number): string => {
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}k`
        }
        return count.toString()
    }

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

    return (
        <div className="h-screen flex flex-col bg-background">
            {/* Header */}
            <header className="border-b border-[rgba(255,255,255,0.06)] bg-gradient-to-r from-[rgba(30,41,59,0.4)] to-[rgba(15,23,42,0.5)] backdrop-blur-[16px] hud-scanlines">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)]">
                            <Shield className="h-6 w-6 text-[#F59E0B]" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight hud-text-glow">Archon</h1>
                            <p className="text-xs text-muted-foreground font-data">Investigation numérique</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Mode Toggle */}
                        {hasDocuments && (
                            <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(22,27,34,0.6)] p-1">
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
                        )}

                        {/* Stats display */}
                        {hasDocuments && stats && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground font-data">
                                <FileText className="h-4 w-4" />
                                <span>{formatDocumentCount(stats.total_documents)} documents</span>
                            </div>
                        )}

                        <Link to="/scans">
                            <Button variant="outline" size="sm" className="gap-2">
                                <FolderSearch className="h-4 w-4" />
                                Scanner
                            </Button>
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Activity className="h-3 w-3 text-green-500" />
                            <span>Connecté</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-hidden">
                {statsLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="animate-pulse text-muted-foreground">Chargement...</div>
                    </div>
                ) : !hasDocuments ? (
                    <EmptyState onStartScan={handleStartScan} />
                ) : (
                    <PanelGroup direction="horizontal" className="h-full">
                        {/* Left Panel - Search/Browse & Results */}
                        <Panel defaultSize={40} minSize={30} maxSize={60}>
                            <div className="flex flex-col h-full border-r border-[rgba(255,255,255,0.06)]">
                                {viewMode === 'search' ? (
                                    <>
                                        {/* Search Bar */}
                                        <div className="p-4 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,34,0.4)]">
                                            <SearchBar
                                                onSearch={handleSearch}
                                                isLoading={isLoading}
                                                disabled={!hasDocuments}
                                            />
                                        </div>

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
                                            <div className="p-3 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,34,0.4)] flex items-center justify-between text-sm">
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
                            <div className="h-full bg-[rgba(15,18,21,0.4)]">
                                <DocumentViewer
                                    documentId={selectedDocumentId}
                                    searchQuery={viewMode === 'search' ? lastQuery : undefined}
                                />
                            </div>
                        </Panel>
                    </PanelGroup>
                )}
            </main>

            {/* Footer */}
            <footer className="border-t border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,34,0.4)] backdrop-blur-[16px] py-2">
                <div className="container mx-auto px-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Archon v1.0 — Recherche Hybride (Meilisearch + Qdrant)</span>
                    <a
                        href="https://github.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                        <Github className="h-3 w-3" />
                        GitHub
                    </a>
                </div>
            </footer>
        </div>
    )
}

export default App
