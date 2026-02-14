import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, FileCode, Video, Mail, File, Loader2 } from 'lucide-react'
import { SearchResult, getDocumentThumbnailUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/contexts/I18nContext'

interface ResultGridProps {
    results: SearchResult[]
    selectedId: number | null
    onSelect: (result: SearchResult) => void
    totalResults: number
    isLoading: boolean
    mode?: 'search' | 'browse'
    hasActiveFilters?: boolean
    thumbnailSize: number
    /** Infinite scroll (search mode): load more when sentinel is visible */
    onLoadMore?: () => void
    hasMore?: boolean
    isLoadingMore?: boolean
}

function fileTypeIcon(type: string) {
    const t = (type || '').toLowerCase()
    if (t === 'pdf') return <FileText className="h-6 w-6 text-red-400" />
    if (t === 'image') return <ImageIcon className="h-6 w-6 text-blue-400" />
    if (t === 'text') return <FileCode className="h-6 w-6 text-emerald-400" />
    if (t === 'video') return <Video className="h-6 w-6 text-purple-400" />
    if (t === 'email') return <Mail className="h-6 w-6 text-amber-400" />
    return <File className="h-6 w-6 text-muted-foreground" />
}

function canThumbnail(type: string): boolean {
    const t = (type || '').toLowerCase()
    return t === 'image' || t === 'pdf' || t === 'video'
}

function ResultGridItem({
    result,
    isSelected,
    thumbnailSize,
    onClick,
}: {
    result: SearchResult
    isSelected: boolean
    thumbnailSize: number
    onClick: () => void
}) {
    const [thumbError, setThumbError] = useState(false)
    const showThumb = canThumbnail(result.file_type) && !thumbError
    const requestSize = Math.max(80, Math.min(600, Math.round(thumbnailSize * 2)))

    useEffect(() => setThumbError(false), [result.document_id, result.file_type])

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group overflow-hidden rounded-lg border bg-card/20 text-left transition-all hover:border-primary/40 hover:bg-muted/20',
                isSelected && 'border-primary/60 ring-2 ring-primary/30'
            )}
        >
            <div className="relative bg-muted/30" style={{ aspectRatio: '1 / 1' }}>
                {showThumb ? (
                    <img
                        src={getDocumentThumbnailUrl(result.document_id, requestSize)}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                        onError={() => setThumbError(true)}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        {fileTypeIcon(result.file_type)}
                    </div>
                )}

                <div className="absolute left-2 top-2 flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {result.file_type}
                    </Badge>
                </div>
            </div>

            <div className="p-2">
                <p className="text-xs font-medium truncate">{result.file_name}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground truncate" title={result.file_path}>
                    {result.file_path}
                </p>
            </div>
        </button>
    )
}

export function ResultGrid({
    results,
    selectedId,
    onSelect,
    totalResults,
    isLoading,
    mode = 'search',
    hasActiveFilters = false,
    thumbnailSize,
    onLoadMore,
    hasMore = false,
    isLoadingMore = false,
}: ResultGridProps) {
    const { t } = useTranslation()
    const sentinelRef = useRef<HTMLDivElement>(null)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (mode !== 'search' || !onLoadMore || !hasMore || isLoadingMore || results.length === 0) return
        const sentinel = sentinelRef.current
        const root = scrollContainerRef.current
        if (!sentinel || !root) return
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) onLoadMore()
            },
            { root, rootMargin: '240px', threshold: 0 }
        )
        obs.observe(sentinel)
        return () => obs.disconnect()
    }, [mode, onLoadMore, hasMore, isLoadingMore, results.length])

    const gridTemplateColumns = useMemo(() => {
        const px = Math.max(90, Math.min(340, Math.round(thumbnailSize)))
        return `repeat(auto-fill, minmax(${px}px, 1fr))`
    }, [thumbnailSize])

    if (isLoading) {
        const skeletonCols = 12
        return (
            <div className="p-4 grid gap-3" style={{ gridTemplateColumns }}>
                {Array.from({ length: skeletonCols }).map((_, idx) => (
                    <div key={idx} className="rounded-lg border bg-card/20 overflow-hidden">
                        <div className="bg-muted/30 animate-pulse" style={{ aspectRatio: '1 / 1' }} />
                        <div className="p-2 space-y-2">
                            <div className="h-3 w-3/4 bg-muted/40 rounded animate-pulse" />
                            <div className="h-2.5 w-full bg-muted/30 rounded animate-pulse" />
                        </div>
                    </div>
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
                <ImageIcon className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">{emptyTitle}</p>
                <p className="text-sm">{emptyDescription}</p>
                {mode === 'search' && (
                    <p className="text-xs mt-2 text-muted-foreground/80 max-w-sm">{t('home.noResultsTip')}</p>
                )}
            </div>
        )
    }

    const gridContent = (
        <div className="p-4 grid gap-3" style={{ gridTemplateColumns }}>
            {results.map((result) => (
                <ResultGridItem
                    key={result.document_id}
                    result={result}
                    isSelected={selectedId === result.document_id}
                    thumbnailSize={thumbnailSize}
                    onClick={() => onSelect(result)}
                />
            ))}
            {mode === 'search' && hasMore && (
                <div ref={sentinelRef} className="h-4" aria-hidden />
            )}
            {mode === 'search' && isLoadingMore && (
                <div className="col-span-full flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
            )}
        </div>
    )

    return mode === 'search' && onLoadMore ? (
        <div ref={scrollContainerRef} className="flex-1 overflow-auto rounded-[inherit]">
            <div className="px-4 py-2 border-b text-xs text-muted-foreground">
                {totalResults.toLocaleString()} {t('common.documents')}
            </div>
            {gridContent}
        </div>
    ) : (
        <div className="flex-1 overflow-auto rounded-[inherit]">
            <div className="px-4 py-2 border-b text-xs text-muted-foreground">
                {totalResults.toLocaleString()} {t('common.documents')}
            </div>
            {gridContent}
        </div>
    )
}
