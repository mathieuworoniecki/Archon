import { useState, useMemo } from 'react'
import { Grid, List, Play, Image as ImageIcon, ZoomIn, ZoomOut, Filter, HardDrive, LayoutGrid, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { Document, API_BASE, getDocumentFileUrl } from '@/lib/api'
import { MediaViewer } from './MediaViewer'
import { useTranslation } from '@/contexts/I18nContext'

interface GalleryViewProps {
    documents: Document[]
    onSelectDocument?: (doc: Document) => void
    className?: string
}

type ViewMode = 'grid' | 'masonry' | 'list'
type MediaFilter = 'all' | 'image' | 'video'
type SizeFilter = 'all' | 'small' | 'medium' | 'large'

export function GalleryView({ documents, onSelectDocument, className }: GalleryViewProps) {
    const { t } = useTranslation()
    const [viewMode, setViewMode] = useState<ViewMode>('grid')
    const [thumbnailSize, setThumbnailSize] = useState(150)
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all')
    const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all')
    const [showFilters, setShowFilters] = useState(false)

    // Filter only media files
    const mediaDocuments = useMemo(() => {
        return documents.filter(doc => {
            const fileName = doc.file_name.toLowerCase()
            return doc.file_type === 'image' || 
                   fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp|mp4|webm|mov|avi)$/i)
        })
    }, [documents])

    const isVideo = (doc: Document) => {
        return doc.file_name.toLowerCase().match(/\.(mp4|webm|mov|avi)$/i)
    }

    // Apply filters
    const filteredDocuments = useMemo(() => {
        let result = mediaDocuments

        // Type filter
        if (mediaFilter === 'image') {
            result = result.filter(doc => !isVideo(doc))
        } else if (mediaFilter === 'video') {
            result = result.filter(doc => isVideo(doc))
        }

        // Size filter
        if (sizeFilter === 'small') {
            result = result.filter(doc => doc.file_size < 100 * 1024) // < 100KB
        } else if (sizeFilter === 'medium') {
            result = result.filter(doc => doc.file_size >= 100 * 1024 && doc.file_size < 1024 * 1024)
        } else if (sizeFilter === 'large') {
            result = result.filter(doc => doc.file_size >= 1024 * 1024) // > 1MB
        }

        return result
    }, [mediaDocuments, mediaFilter, sizeFilter])

    const getThumbnailUrl = (docItem: Document) => {
        return `${API_BASE}/documents/${docItem.id}/thumbnail`
    }

    const handleClick = (_doc: Document, index: number) => {
        setSelectedIndex(index)
    }

    const handleDoubleClick = (doc: Document) => {
        onSelectDocument?.(doc)
    }

    const activeFilterCount = (mediaFilter !== 'all' ? 1 : 0) + (sizeFilter !== 'all' ? 1 : 0)

    if (mediaDocuments.length === 0) {
        return (
            <div className={cn("flex flex-col items-center justify-center p-12 text-center text-muted-foreground", className)}>
                <ImageIcon className="h-16 w-16 mb-4 opacity-30" />
                <p className="font-medium">{t('gallery.emptyTitle')}</p>
                <p className="text-sm mt-1 max-w-sm">{t('gallery.emptyDescription')}</p>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between p-3 border-b bg-card/50">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                        {filteredDocuments.length} / {mediaDocuments.length} {t('gallery.mediaCount')}
                    </span>
                    <Button
                        variant={showFilters ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <Filter className="h-3 w-3" />
                        {t('gallery.filters')}
                        {activeFilterCount > 0 && (
                            <span className="ml-1 bg-primary-foreground text-primary rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
                                {activeFilterCount}
                            </span>
                        )}
                    </Button>
                </div>

                <div className="flex items-center gap-4">
                    {/* Thumbnail size slider */}
                    <div className="flex items-center gap-2 w-32">
                        <ZoomOut className="h-4 w-4 text-muted-foreground" />
                        <Slider
                            value={[thumbnailSize]}
                            onValueChange={([v]: number[]) => setThumbnailSize(v)}
                            min={80}
                            max={300}
                            step={20}
                            className="w-20"
                        />
                        <ZoomIn className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* View mode toggle */}
                    <div className="flex items-center border rounded-md">
                        <Button
                            variant={viewMode === 'grid' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setViewMode('grid')}
                            title={t('gallery.gridView')}
                        >
                            <Grid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'masonry' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setViewMode('masonry')}
                            title={t('gallery.masonryView')}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setViewMode('list')}
                            title={t('gallery.listView')}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            {showFilters && (
                <div className="flex items-center gap-4 p-3 border-b bg-muted/30 animate-in slide-in-from-top-1 duration-200">
                    {/* Type filter */}
                    <div className="flex items-center gap-1.5">
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{t('gallery.type')}:</span>
                        <div className="flex items-center gap-0.5">
                            {(['all', 'image', 'video'] as MediaFilter[]).map(f => (
                                <Button
                                    key={f}
                                    variant={mediaFilter === f ? 'default' : 'ghost'}
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setMediaFilter(f)}
                                >
                                    {f === 'all' ? t('gallery.all') : f === 'image' ? t('gallery.images') : t('gallery.videos')}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Size filter */}
                    <div className="flex items-center gap-1.5">
                        <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{t('gallery.size')}:</span>
                        <div className="flex items-center gap-0.5">
                            {(['all', 'small', 'medium', 'large'] as SizeFilter[]).map(f => (
                                <Button
                                    key={f}
                                    variant={sizeFilter === f ? 'default' : 'ghost'}
                                    size="sm"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => setSizeFilter(f)}
                                >
                                    {f === 'all' ? t('gallery.all') : f === 'small' ? '< 100KB' : f === 'medium' ? '100KB-1MB' : '> 1MB'}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Reset */}
                    {activeFilterCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-muted-foreground"
                            onClick={() => { setMediaFilter('all'); setSizeFilter('all') }}
                        >
                            {t('gallery.reset')}
                        </Button>
                    )}
                </div>
            )}

            {/* Gallery */}
            <div className="flex-1 overflow-auto p-3">
                {viewMode === 'masonry' ? (
                    /* ═══ Masonry Layout ═══ */
                    <div
                        className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-2 space-y-2"
                        style={{ columnWidth: `${thumbnailSize}px` }}
                    >
                        {filteredDocuments.map((doc, index) => (
                            <div
                                key={doc.id}
                                onClick={() => handleClick(doc, index)}
                                onDoubleClick={() => handleDoubleClick(doc)}
                                className={cn(
                                    "group relative cursor-pointer rounded-lg overflow-hidden border transition-all break-inside-avoid",
                                    "hover:ring-2 hover:ring-primary/50",
                                    selectedIndex === index && "ring-2 ring-primary"
                                )}
                            >
                                <img
                                    src={getThumbnailUrl(doc)}
                                    alt={doc.file_name}
                                    className="w-full h-auto object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = getDocumentFileUrl(doc.id)
                                    }}
                                />
                                {isVideo(doc) && (
                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                        <Play className="h-8 w-8 text-white fill-white" />
                                    </div>
                                )}
                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-xs text-white truncate">{doc.file_name}</p>
                                    <div className="flex items-center gap-2 text-[10px] text-white/60">
                                        <span>{(doc.file_size / 1024).toFixed(0)} KB</span>
                                        {doc.file_modified_at && (
                                            <span className="flex items-center gap-0.5">
                                                <Calendar className="h-2.5 w-2.5" />
                                                {new Date(doc.file_modified_at).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* ═══ Grid / List Layout ═══ */
                    <div 
                        className={cn(
                            viewMode === 'grid' 
                                ? "grid gap-2"
                                : "flex flex-col gap-1"
                        )}
                        style={viewMode === 'grid' ? {
                            gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`
                        } : undefined}
                    >
                        {filteredDocuments.map((doc, index) => (
                            <div
                                key={doc.id}
                                onClick={() => handleClick(doc, index)}
                                onDoubleClick={() => handleDoubleClick(doc)}
                                className={cn(
                                    "group relative cursor-pointer rounded-lg overflow-hidden border transition-all",
                                    "hover:ring-2 hover:ring-primary/50",
                                    selectedIndex === index && "ring-2 ring-primary",
                                    viewMode === 'list' && "flex items-center gap-3 p-2"
                                )}
                                style={viewMode === 'grid' ? { 
                                    aspectRatio: '1',
                                    height: thumbnailSize 
                                } : undefined}
                            >
                                {/* Thumbnail */}
                                <div 
                                    className={cn(
                                        "bg-muted overflow-hidden",
                                        viewMode === 'grid' ? "absolute inset-0" : "w-12 h-12 flex-shrink-0 rounded"
                                    )}
                                >
                                    <img
                                        src={getThumbnailUrl(doc)}
                                        alt={doc.file_name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = getDocumentFileUrl(doc.id)
                                        }}
                                    />
                                </div>

                                {/* Video indicator */}
                                {isVideo(doc) && (
                                    <div className={cn(
                                        "absolute flex items-center justify-center",
                                        viewMode === 'grid' 
                                            ? "inset-0 bg-black/30"
                                            : "left-0 top-0 w-12 h-12 bg-black/50 rounded"
                                    )}>
                                        <Play className="h-8 w-8 text-white fill-white" />
                                    </div>
                                )}

                                {/* Filename */}
                                {viewMode === 'grid' ? (
                                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="text-xs text-white truncate">{doc.file_name}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-white/60">
                                            <span>{(doc.file_size / 1024).toFixed(0)} KB</span>
                                            {doc.file_modified_at && (
                                                <span className="flex items-center gap-0.5">
                                                    <Calendar className="h-2.5 w-2.5" />
                                                    {new Date(doc.file_modified_at).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{doc.file_name}</p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span>{(doc.file_size / 1024).toFixed(0)} KB</span>
                                            {doc.file_modified_at && (
                                                <span className="flex items-center gap-0.5">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(doc.file_modified_at).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Media Viewer Lightbox */}
            <MediaViewer
                documents={filteredDocuments}
                initialIndex={selectedIndex ?? 0}
                isOpen={selectedIndex !== null}
                onClose={() => setSelectedIndex(null)}
            />
        </div>
    )
}
