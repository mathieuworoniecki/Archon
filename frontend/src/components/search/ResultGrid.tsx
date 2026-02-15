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
    density?: 'comfortable' | 'compact'
    showPreview?: boolean
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

function stripHtml(text: string): string {
    return text.replace(/<[^>]+>/g, '')
}

function getParentFolder(path: string): string | null {
    const normalized = (path || '').replace(/\\/g, '/')
    const parts = normalized.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return parts[parts.length - 2] || null
}

function ResultGridItem({
    result,
    isSelected,
    thumbnailSize,
    density,
    showPreview,
    onClick,
}: {
    result: SearchResult
    isSelected: boolean
    thumbnailSize: number
    density: 'comfortable' | 'compact'
    showPreview: boolean
    onClick: () => void
}) {
    const [thumbError, setThumbError] = useState(false)
    const showThumb = canThumbnail(result.file_type) && !thumbError
    const requestSize = Math.max(80, Math.min(600, Math.round(thumbnailSize * 2)))
    const rawSnippet = (result.snippet || '').trim()
    const previewText = useMemo(() => {
        const snippet = rawSnippet ? stripHtml(rawSnippet).replace(/\s+/g, ' ').trim() : ''
        if (snippet) return snippet.slice(0, 240)
        const parent = getParentFolder(result.file_path || '')
        return parent ? parent : (result.file_path || '').slice(0, 240)
    }, [rawSnippet, result.file_path])

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

                {!!previewText && (
                    <div
                        className={cn(
                            'absolute inset-x-0 bottom-0 px-2 pb-2 pt-6 text-[10px] leading-snug text-white/90',
                            'bg-gradient-to-t from-black/80 via-black/40 to-transparent',
                            'transition-opacity',
                            showPreview ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        )}
                    >
                        <div className={cn(
                            'overflow-hidden',
                            density === 'compact' ? 'max-h-[34px]' : 'max-h-[44px]'
                        )}>
                            {previewText}
                        </div>
                    </div>
                )}

                <div className="absolute left-2 top-2 flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {result.file_type}
                    </Badge>
                </div>
            </div>

            <div className={cn('p-2', density === 'compact' && 'p-1.5')}>
                <p className="text-xs font-medium truncate">{result.file_name}</p>
                <p
                    className={cn(
                        'mt-0.5 text-[10px] text-muted-foreground truncate',
                        density === 'compact' && 'hidden md:block'
                    )}
                    title={result.file_path}
                >
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
    density = 'comfortable',
    showPreview = true,
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
        const minPx = density === 'compact' ? Math.max(80, px - 30) : px
        return `repeat(auto-fill, minmax(${minPx}px, 1fr))`
    }, [density, thumbnailSize])

    if (isLoading) {
        const skeletonCols = 12
        return (
            <div className={cn('p-4 grid', density === 'compact' ? 'gap-2' : 'gap-3')} style={{ gridTemplateColumns }}>
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
        <div className={cn('p-4 grid', density === 'compact' ? 'gap-2' : 'gap-3')} style={{ gridTemplateColumns }}>
            {results.map((result) => (
                <ResultGridItem
                    key={result.document_id}
                    result={result}
                    isSelected={selectedId === result.document_id}
                    thumbnailSize={thumbnailSize}
                    density={density}
                    showPreview={showPreview}
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
