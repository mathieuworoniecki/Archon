import { useState, useEffect, useCallback, useRef } from 'react'
import { Image as ImageIcon, Search, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { GalleryView } from '@/components/gallery/GalleryView'
import { Document, API_BASE } from '@/lib/api'
import { authFetch } from '@/lib/auth'
import { useTranslation } from '@/contexts/I18nContext'
import { useProject } from '@/contexts/ProjectContext'
import { isLikelyVisualDocument } from '@/lib/media'
import { GalleryGridSkeleton } from '@/components/ui/skeleton'

const PAGE_SIZE = 50

export function GalleryPage() {
    const [documents, setDocuments] = useState<Document[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [nextOffset, setNextOffset] = useState(0)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [error, setError] = useState<string | null>(null)
    const { t } = useTranslation()
    const { selectedProject } = useProject()
    const sentinelRef = useRef<HTMLDivElement>(null)

    // Load media documents with pagination
    const fetchMedia = useCallback(async (offset = 0, append = false) => {
        if (offset === 0 && !append) setIsLoading(true)
        else setIsLoadingMore(true)
        try {
            let cursor = offset
            let reachedEnd = false
            let batchCount = 0
            const mediaBatch: Document[] = []
            const localSeen = new Set<number>()

            // Some datasets contain many "unknown" docs that are not actual media.
            // We keep fetching raw pages until we collect enough real media docs.
            while (mediaBatch.length < PAGE_SIZE && !reachedEnd && batchCount < 12) {
                const params = new URLSearchParams()
                params.set('limit', String(PAGE_SIZE))
                params.set('skip', String(cursor))
                params.append('file_types', 'image')
                params.append('file_types', 'video')
                params.append('file_types', 'pdf')
                params.append('file_types', 'unknown')
                if (selectedProject?.path) params.set('project_path', selectedProject.path)

                const response = await authFetch(`${API_BASE}/documents/?${params}`)
                if (!response.ok) throw new Error('Failed to fetch gallery documents')

                const data = await response.json()
                const rawDocs: Document[] = data.documents || []
                const filtered = rawDocs.filter((doc) => isLikelyVisualDocument(doc))
                for (const doc of filtered) {
                    if (!localSeen.has(doc.id)) {
                        localSeen.add(doc.id)
                        mediaBatch.push(doc)
                    }
                }

                cursor += rawDocs.length
                reachedEnd = rawDocs.length < PAGE_SIZE
                batchCount += 1
                if (rawDocs.length === 0) break
            }

            setDocuments((prev) => {
                const base = append ? prev : []
                const deduped = new Map<number, Document>()
                for (const doc of base) deduped.set(doc.id, doc)
                for (const doc of mediaBatch) deduped.set(doc.id, doc)
                return Array.from(deduped.values())
            })
            setNextOffset(cursor)
            setHasMore(!reachedEnd)
            setError(null)
        } catch {
            if (!append) setError(t('gallery.error'))
        } finally {
            setIsLoading(false)
            setIsLoadingMore(false)
        }
    }, [selectedProject?.path, t])

    useEffect(() => { fetchMedia() }, [fetchMedia])

    const handleLoadMore = useCallback(() => {
        if (!isLoadingMore && hasMore) {
            fetchMedia(nextOffset, true)
        }
    }, [nextOffset, isLoadingMore, hasMore, fetchMedia])

    // Infinite scroll via IntersectionObserver
    useEffect(() => {
        if (!sentinelRef.current || !hasMore || searchQuery || isLoadingMore) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    handleLoadMore()
                }
            },
            { rootMargin: '200px' }
        )
        observer.observe(sentinelRef.current)
        return () => observer.disconnect()
    }, [hasMore, searchQuery, isLoadingMore, handleLoadMore])

    // Search media with OCR text
    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!searchInput.trim()) {
            setSearchQuery('')
            setHasMore(true)
            setNextOffset(0)
            fetchMedia(0, false)
            return
        }
        setIsLoading(true)
        setHasMore(false) // Search results are not paginated
        try {
            const response = await authFetch(`${API_BASE}/search/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: searchInput,
                    file_types: ['image', 'video', 'pdf', 'unknown'],
                    limit: 100,
                    project_path: selectedProject?.path
                })
            })
            if (response.ok) {
                const data = await response.json()
                const searchDocs: Document[] = data.results.map((r: { document_id: number; file_name: string; file_path: string; file_type: string }) => ({
                    id: r.document_id,
                    file_name: r.file_name,
                    file_path: r.file_path,
                    file_type: r.file_type as Document['file_type'],
                    file_size: 0,
                    text_length: 0,
                    has_ocr: true,
                    file_modified_at: null,
                    indexed_at: ''
                })).filter((doc: Document) => isLikelyVisualDocument(doc))
                setDocuments(searchDocs)
                setSearchQuery(searchInput)
            }
        } catch {
            setError(t('gallery.error'))
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b bg-card/50">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-primary" />
                        <h1 className="text-lg font-semibold">{t('gallery.title')}</h1>
                        <span className="text-sm text-muted-foreground">
                            ({documents.length}{hasMore ? '+' : ''})
                        </span>
                    </div>

                    {/* Search bar */}
                    <form onSubmit={handleSearch} className="flex-1 max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder={t('gallery.searchPlaceholder')}
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </form>

                    {searchQuery && (
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => { setSearchInput(''); setSearchQuery(''); setHasMore(true); setNextOffset(0); fetchMedia(0, false) }}
                        >
                            {t('gallery.reset')}
                        </Button>
                    )}
                </div>

                {searchQuery && (
                    <p className="text-sm text-muted-foreground mt-2">
                        {t('gallery.resultsFor').replace('{query}', searchQuery)}
                    </p>
                )}
            </div>

            {/* Error banner */}
            {error && (
                <div className="mx-4 mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-red-500">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span className="text-sm">{error}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => { setError(null); fetchMedia() }} className="gap-1.5 shrink-0">
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t('common.retry')}
                    </Button>
                </div>
            )}

            {/* Gallery Content */}
            {isLoading ? (
                <div className="flex-1 overflow-auto">
                    <GalleryGridSkeleton />
                </div>
            ) : (
                <div className="flex-1 flex flex-col overflow-auto">
                    <GalleryView 
                        documents={documents}
                        className="flex-1"
                    />
                    {/* Infinite scroll sentinel — replaces "Load More" button */}
                    {hasMore && !searchQuery && (
                        <div ref={sentinelRef} className="p-4 flex justify-center">
                            {isLoadingMore && (
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
