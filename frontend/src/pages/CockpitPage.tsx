import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CockpitProvider, useCockpit } from '@/contexts/CockpitContext'
import { FilterPanel } from '@/components/cockpit/FilterPanel'
import { MetadataBar } from '@/components/cockpit/MetadataBar'
import { ResultList } from '@/components/search/ResultList'
import { DocumentViewer } from '@/components/viewer/DocumentViewer'
import { useSearch } from '@/hooks/useSearch'
import { SearchResult } from '@/lib/api'
import { useTranslation } from '@/contexts/I18nContext'

function CockpitContent() {
    const {
        filters,
        selectedDocumentId,
        setSelectedDocument,
        setResults,
        setLoading,
        updateFilters,
    } = useCockpit()

    const [searchParams] = useSearchParams()
    const { t } = useTranslation()

    // Pre-fill date filter from URL ?date=YYYY-MM
    useEffect(() => {
        const dateParam = searchParams.get('date')
        if (dateParam) {
            const [year, month] = dateParam.split('-').map(Number)
            if (year && month) {
                const from = new Date(year, month - 1, 1)
                const to = new Date(year, month, 0) // last day of month
                updateFilters({ dateRange: { from, to } })
            }
        }
    }, [searchParams, updateFilters])

    const { 
        results: searchResults, 
        totalResults: searchTotal, 
        processingTime, 
        isLoading: searchLoading,
        performSearch 
    } = useSearch()

    // Sync search results to context
    useEffect(() => {
        setResults(searchResults, searchTotal)
    }, [searchResults, searchTotal, setResults])

    useEffect(() => {
        setLoading(searchLoading)
    }, [searchLoading, setLoading])

    const handleSearch = useCallback(async () => {
        await performSearch(filters.query, {
            semantic_weight: filters.semanticWeight,
            file_types: filters.fileTypes.length > 0 ? filters.fileTypes : undefined,
            limit: 50
        })
    }, [filters, performSearch])

    const handleSelectResult = useCallback((result: SearchResult) => {
        setSelectedDocument(result.document_id, result)
    }, [setSelectedDocument])

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Main Content - 3 columns */}
            <div className="flex flex-1 min-h-0">
                
                {/* Zone 1: Filters */}
                <div className="w-64 shrink-0 border-r bg-card/30">
                    <FilterPanel onSearch={handleSearch} />
                </div>

                {/* Zone 2: Results */}
                <div className="w-96 shrink-0 border-r flex flex-col">
                    <div className="flex-1 min-h-0">
                        <ResultList
                            results={searchResults}
                            selectedId={selectedDocumentId}
                            onSelect={handleSelectResult}
                            totalResults={searchTotal}
                            processingTime={processingTime}
                            isLoading={searchLoading}
                        />
                    </div>
                </div>

                {/* Zone 3: Viewer */}
                <div className="flex-1 min-w-0 flex flex-col">
                    {selectedDocumentId ? (
                        <DocumentViewer documentId={selectedDocumentId} />
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-muted-foreground">
                            <div className="text-center">
                                <p className="text-lg">{t('cockpit.noDocument')}</p>
                                <p className="text-sm mt-1">{t('cockpit.clickToView')}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Zone 4: Metadata Bar */}
            <div className="h-12 border-t bg-card/50 shrink-0">
                <MetadataBar className="h-full" />
            </div>
        </div>
    )
}

export function CockpitPage() {
    return (
        <CockpitProvider>
            <CockpitContent />
        </CockpitProvider>
    )
}
