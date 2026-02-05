import { useState, useMemo } from 'react'
import { Grid, List, Play, Image as ImageIcon, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { Document, API_BASE, getDocumentFileUrl } from '@/lib/api'
import { MediaViewer } from './MediaViewer'

interface GalleryViewProps {
    documents: Document[]
    onSelectDocument?: (doc: Document) => void
    className?: string
}

type ViewMode = 'grid' | 'list'

export function GalleryView({ documents, onSelectDocument, className }: GalleryViewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('grid')
    const [thumbnailSize, setThumbnailSize] = useState(150)
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

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

    const getThumbnailUrl = (docItem: Document) => {
        return `${API_BASE}/documents/${docItem.id}/thumbnail`
    }

    const handleClick = (_doc: Document, index: number) => {
        setSelectedIndex(index)
    }

    const handleDoubleClick = (doc: Document) => {
        onSelectDocument?.(doc)
    }

    if (mediaDocuments.length === 0) {
        return (
            <div className={cn("flex flex-col items-center justify-center p-8 text-muted-foreground", className)}>
                <ImageIcon className="h-16 w-16 mb-4 opacity-30" />
                <p>Aucun média trouvé</p>
            </div>
        )
    }

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Toolbar */}
            <div className="flex items-center justify-between p-3 border-b bg-card/50">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                        {mediaDocuments.length} média{mediaDocuments.length > 1 ? 's' : ''}
                    </span>
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
                        >
                            <Grid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'default' : 'ghost'}
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => setViewMode('list')}
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Gallery Grid */}
            <div className="flex-1 overflow-auto p-3">
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
                    {mediaDocuments.map((doc, index) => (
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
                                        // Fallback to full image
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

                            {/* Filename (visible in list mode, hover in grid mode) */}
                            {viewMode === 'grid' ? (
                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-xs text-white truncate">{doc.file_name}</p>
                                </div>
                            ) : (
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{doc.file_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {(doc.file_size / 1024).toFixed(0)} KB
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Media Viewer Lightbox */}
            <MediaViewer
                documents={mediaDocuments}
                initialIndex={selectedIndex ?? 0}
                isOpen={selectedIndex !== null}
                onClose={() => setSelectedIndex(null)}
            />
        </div>
    )
}
