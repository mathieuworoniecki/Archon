import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { SearchResult, addFavorite } from '@/lib/api'
import { authFetch } from '@/lib/auth'
import { ResultCard } from './ResultCard'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { FileSearch, Clock, Star, Download, X, CheckSquare, FileText, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResultCardSkeleton } from '@/components/ui/skeleton'
import { useTranslation } from '@/contexts/I18nContext'

interface ResultListProps {
    results: SearchResult[]
    selectedId: number | null
    onSelect: (result: SearchResult) => void
    totalResults: number
    processingTime: number
    isLoading: boolean
    mode?: 'search' | 'browse'
    hasActiveFilters?: boolean
    /** Infinite scroll (search mode): load more when sentinel is visible */
    onLoadMore?: () => void
    hasMore?: boolean
    isLoadingMore?: boolean
}

export function ResultList({
    results,
    selectedId,
    onSelect,
    totalResults,
    processingTime,
    isLoading,
    mode = 'search',
    hasActiveFilters = false,
    onLoadMore,
    hasMore = false,
    isLoadingMore = false,
}: ResultListProps) {
    const { t } = useTranslation()
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
    const sentinelRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [scrollTop, setScrollTop] = useState(0)
    const [viewportHeight, setViewportHeight] = useState(800)

    const ROW_HEIGHT = 168
    const OVERSCAN = 6

    const shouldVirtualize = mode === 'search' && results.length > 120

    const virtualRange = useMemo(() => {
        if (!shouldVirtualize) {
            return { start: 0, end: results.length, topPad: 0, bottomPad: 0 }
        }
        const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
        const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
        const end = Math.min(results.length, start + visibleCount)
        const topPad = start * ROW_HEIGHT
        const bottomPad = Math.max(0, (results.length - end) * ROW_HEIGHT)
        return { start, end, topPad, bottomPad }
    }, [shouldVirtualize, results.length, scrollTop, viewportHeight])

    useEffect(() => {
        if (mode !== 'search' || !onLoadMore || !hasMore || isLoadingMore || results.length === 0) return
        const sentinel = sentinelRef.current
        const root = scrollContainerRef.current
        if (!sentinel || !root) return
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) onLoadMore()
            },
            { root, rootMargin: '200px', threshold: 0 }
        )
        obs.observe(sentinel)
        return () => obs.disconnect()
    }, [mode, onLoadMore, hasMore, isLoadingMore, results.length])

    useEffect(() => {
        const root = scrollContainerRef.current
        if (!root) return
        const update = () => setViewportHeight(root.clientHeight || 800)
        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])
    const [isExporting, setIsExporting] = useState(false)
    const [isAddingFavorites, setIsAddingFavorites] = useState(false)

    const toggleSelection = useCallback((id: number, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }, [])

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(results.map(r => r.document_id)))
    }, [results])

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set())
    }, [])

    const handleBatchFavorite = useCallback(async () => {
        if (selectedIds.size === 0) return
        setIsAddingFavorites(true)
        try {
            await Promise.all(
                Array.from(selectedIds).map(id => addFavorite(id))
            )
            clearSelection()
        } catch {
            // errors during batch add are non-fatal — selection cleared regardless
        } finally {
            setIsAddingFavorites(false)
        }
    }, [selectedIds, clearSelection])

    const handleBatchExport = useCallback(async () => {
        if (selectedIds.size === 0) return
        setIsExporting(true)
        try {
            // Export selected results as CSV
            const selectedResults = results.filter(r => selectedIds.has(r.document_id))
            const csvContent = [
                ['ID', 'Fichier', 'Chemin', 'Type', 'Score'].join(','),
                ...selectedResults.map(r => [
                    r.document_id,
                    `"${r.file_name}"`,
                    `"${r.file_path}"`,
                    r.file_type,
                    r.score?.toFixed(3) || ''
                ].join(','))
            ].join('\n')
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `archon-export-${new Date().toISOString().slice(0, 10)}.csv`
            link.click()
            URL.revokeObjectURL(url)
        } finally {
            setIsExporting(false)
        }
    }, [selectedIds, results])

    if (isLoading) {
        return (
            <div className="space-y-3 p-4">
                {[1, 2, 3, 4, 5].map((i) => (
                    <ResultCardSkeleton key={i} />
                ))}
            </div>
        )
    }

    if (results.length === 0) {
        const emptyTitle =
            mode === 'browse'
                ? hasActiveFilters
                    ? 'Aucun document avec ces filtres'
                    : 'Aucun document'
                : 'Aucun résultat'

        const emptyDescription =
            mode === 'browse'
                ? hasActiveFilters
                    ? 'Modifiez ou effacez les filtres pour élargir la liste.'
                    : 'Aucun document indexé pour ce projet.'
                : 'Lancez une recherche pour voir les résultats'

        return (
            <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground px-4 text-center">
                <FileSearch className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">{emptyTitle}</p>
                <p className="text-sm">{emptyDescription}</p>
                {mode === 'search' && (
                    <p className="text-xs mt-2 text-muted-foreground/80 max-w-sm">{t('home.noResultsTip')}</p>
                )}
            </div>
        )
    }

    const hasSelection = selectedIds.size > 0

    return (
        <div className="flex flex-col h-full">
            {/* Stats bar + Selection controls */}
            <div className="flex items-center justify-between px-4 py-2 border-b text-sm">
                <div className="flex items-center gap-3">
                    <button
                        onClick={hasSelection ? clearSelection : selectAll}
                        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <CheckSquare className="h-4 w-4" />
                        {hasSelection ? 'Désélectionner' : 'Tout sélectionner'}
                    </button>
                    <span className="text-muted-foreground">
                        {totalResults} {mode === 'browse' ? `document${totalResults > 1 ? 's' : ''}` : `résultat${totalResults > 1 ? 's' : ''}`}
                    </span>
                </div>
                {mode === 'search' && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {processingTime.toFixed(0)}ms
                    </span>
                )}
            </div>

            {/* Batch Action Bar */}
            {hasSelection && (
                <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b">
                    <span className="text-sm font-medium">
                        {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
                    </span>
                    <div className="flex-1" />
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleBatchFavorite}
                        disabled={isAddingFavorites}
                        className="gap-1.5"
                    >
                        <Star className="h-4 w-4" />
                        Ajouter aux favoris
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleBatchExport}
                        disabled={isExporting}
                        className="gap-1.5"
                    >
                        <Download className="h-4 w-4" />
                        CSV
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                            const ids = Array.from(selectedIds)
                            const response = await authFetch('/api/export/pdf', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ document_ids: ids, include_content: true })
                            })
                            if (response.ok) {
                                const blob = await response.blob()
                                const url = URL.createObjectURL(blob)
                                const link = document.createElement('a')
                                link.href = url
                                link.download = `archon-report-${new Date().toISOString().slice(0, 10)}.pdf`
                                link.click()
                                URL.revokeObjectURL(url)
                            }
                        }}
                        className="gap-1.5"
                    >
                        <FileText className="h-4 w-4" />
                        PDF
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearSelection}
                        className="gap-1.5"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* Results — scroll div when infinite scroll (IntersectionObserver root), else ScrollArea */}
            {(() => {
                const renderItems = shouldVirtualize
                    ? results.slice(virtualRange.start, virtualRange.end).map((result) => ({
                        result,
                    }))
                    : results.map((result) => ({ result }))

                const listContent = (
                    <div className="p-4 space-y-3">
                        {shouldVirtualize && virtualRange.topPad > 0 && (
                            <div style={{ height: virtualRange.topPad }} aria-hidden />
                        )}
                        {renderItems.map(({ result }) => (
                            <div key={result.document_id} className="relative group">
                                <div
                                    className={cn(
                                        "absolute left-2 top-1/2 -translate-y-1/2 z-10 transition-opacity",
                                        hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                    )}
                                    onClick={(e) => toggleSelection(result.document_id, e)}
                                >
                                    <Checkbox
                                        checked={selectedIds.has(result.document_id)}
                                        className="h-5 w-5"
                                    />
                                </div>
                                <div className={cn("transition-all", hasSelection || "group-hover:pl-8")}>
                                    <ResultCard
                                        result={result}
                                        isSelected={selectedId === result.document_id}
                                        onClick={() => onSelect(result)}
                                        className={cn(
                                            selectedIds.has(result.document_id) && "ring-2 ring-primary/50 pl-8"
                                        )}
                                    />
                                </div>
                            </div>
                        ))}
                        {shouldVirtualize && virtualRange.bottomPad > 0 && (
                            <div style={{ height: virtualRange.bottomPad }} aria-hidden />
                        )}
                        {mode === 'search' && hasMore && (
                            <div ref={sentinelRef} className="h-4 flex-shrink-0" aria-hidden />
                        )}
                        {mode === 'search' && isLoadingMore && (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        )}
                    </div>
                )
                return mode === 'search' && onLoadMore ? (
                    <div
                        ref={scrollContainerRef}
                        className="flex-1 overflow-auto rounded-[inherit]"
                        onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
                    >
                        {listContent}
                    </div>
                ) : (
                    <ScrollArea className="flex-1">{listContent}</ScrollArea>
                )
            })()}
        </div>
    )
}
