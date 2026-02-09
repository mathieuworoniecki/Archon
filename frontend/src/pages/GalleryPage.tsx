import { useState, useEffect, useCallback, useRef } from 'react'
import { Image as ImageIcon, Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { GalleryView } from '@/components/gallery/GalleryView'
import { Document, API_BASE } from '@/lib/api'
import { authFetch } from '@/lib/auth'
import { useTranslation } from '@/contexts/I18nContext'

const PAGE_SIZE = 50

export function GalleryPage() {
    const [documents, setDocuments] = useState<Document[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const { t } = useTranslation()
    const sentinelRef = useRef<HTMLDivElement>(null)

    // Load media documents with pagination
    const fetchMedia = useCallback(async (offset = 0, append = false) => {
        if (offset === 0) setIsLoading(true)
        else setIsLoadingMore(true)
        try {
            const response = await authFetch(
                `${API_BASE}/documents/?file_types=image&file_types=video&limit=${PAGE_SIZE}&skip=${offset}`
            )
            if (response.ok) {
                const data = await response.json()
                const newDocs = data.documents || []
                setDocuments(prev => append ? [...prev, ...newDocs] : newDocs)
                setHasMore(newDocs.length >= PAGE_SIZE)
            }
        } catch (err) {
            console.error('Failed to fetch media:', err)
        } finally {
            setIsLoading(false)
            setIsLoadingMore(false)
        }
    }, [])

    useEffect(() => { fetchMedia() }, [fetchMedia])

    const handleLoadMore = useCallback(() => {
        if (!isLoadingMore && hasMore) {
            fetchMedia(documents.length, true)
        }
    }, [documents.length, isLoadingMore, hasMore, fetchMedia])

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
            fetchMedia()
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
                    file_types: ['image', 'video'],
                    limit: 100
                })
            })
            if (response.ok) {
                const data = await response.json()
                const searchDocs: Document[] = data.results.map((r: { document_id: number; file_name: string; file_path: string; file_type: string }) => ({
                    id: r.document_id,
                    file_name: r.file_name,
                    file_path: r.file_path,
                    file_type: r.file_type as 'image',
                    file_size: 0,
                    text_length: 0,
                    has_ocr: true,
                    file_modified_at: null,
                    indexed_at: ''
                }))
                setDocuments(searchDocs)
                setSearchQuery(searchInput)
            }
        } catch (err) {
            console.error('Search failed:', err)
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
                            onClick={() => { setSearchInput(''); setSearchQuery(''); fetchMedia() }}
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

            {/* Gallery Content */}
            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
