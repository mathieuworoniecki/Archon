import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Search, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getDocumentFileUrl, getDocument, Document, API_BASE } from '@/lib/api'
import { useTranslation } from '@/contexts/I18nContext'

interface MediaViewerProps {
    documents: Document[]
    initialIndex?: number
    isOpen: boolean
    onClose: () => void
}

export function MediaViewer({ documents, initialIndex = 0, isOpen, onClose }: MediaViewerProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex)
    const [zoom, setZoom] = useState(1)
    const [isPlaying, setIsPlaying] = useState(false)
    const [showOcr, setShowOcr] = useState(false)
    const [ocrText, setOcrText] = useState<string | null>(null)
    const [ocrLoading, setOcrLoading] = useState(false)
    const { t } = useTranslation()
    const navigate = useNavigate()

    const currentDoc = documents[currentIndex]
    const isVideo = currentDoc?.file_name?.match(/\.(mp4|webm|mov|avi)$/i)
    const isImage = currentDoc?.file_type === 'image' || currentDoc?.file_name?.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)

    useEffect(() => {
        setCurrentIndex(initialIndex)
        setZoom(1)
        setShowOcr(false)
        setOcrText(null)
    }, [initialIndex, isOpen])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return
            switch (e.key) {
                case 'Escape': onClose(); break
                case 'ArrowLeft': goToPrev(); break
                case 'ArrowRight': goToNext(); break
                case '+': setZoom(z => Math.min(z + 0.25, 3)); break
                case '-': setZoom(z => Math.max(z - 0.25, 0.5)); break
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, currentIndex])

    const goToPrev = useCallback(() => {
        setCurrentIndex(i => (i > 0 ? i - 1 : documents.length - 1))
        setZoom(1)
        setShowOcr(false)
        setOcrText(null)
    }, [documents.length])

    const goToNext = useCallback(() => {
        setCurrentIndex(i => (i < documents.length - 1 ? i + 1 : 0))
        setZoom(1)
        setShowOcr(false)
        setOcrText(null)
    }, [documents.length])

    const toggleOcr = useCallback(async () => {
        if (showOcr) {
            setShowOcr(false)
            return
        }
        if (ocrText !== null) {
            setShowOcr(true)
            return
        }
        if (!currentDoc) return
        setOcrLoading(true)
        try {
            const doc = await getDocument(currentDoc.id)
            setOcrText(doc.text_content || '')
            setShowOcr(true)
        } catch {
            setOcrText('')
            setShowOcr(true)
        } finally {
            setOcrLoading(false)
        }
    }, [showOcr, ocrText, currentDoc])

    if (!isOpen || !currentDoc) return null

    const mediaUrl = getDocumentFileUrl(currentDoc.id)

    return (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 text-white">
                <div className="flex items-center gap-4">
                    <span className="text-sm opacity-70">
                        {currentIndex + 1} / {documents.length}
                    </span>
                    <span className="font-medium truncate max-w-md">
                        {currentDoc.file_name}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {isImage && (
                        <>
                            <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}>
                                <ZoomOut className="h-4 w-4" />
                            </Button>
                            <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
                            <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(z + 0.25, 3))}>
                                <ZoomIn className="h-4 w-4" />
                            </Button>
                        </>
                    )}
                    {isImage && currentDoc.has_ocr && (
                        <Button
                            variant={showOcr ? 'default' : 'ghost'}
                            size="sm"
                            onClick={toggleOcr}
                            disabled={ocrLoading}
                            className="gap-1.5"
                        >
                            <FileText className="h-4 w-4" />
                            {ocrLoading ? '…' : showOcr ? t('viewer.hideOcr') : t('viewer.showOcr')}
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="h-5 w-5" />
                    </Button>
                </div>
                <div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => { onClose(); navigate(`/?doc=${currentDoc.id}`) }}
                    >
                        <Search className="h-3.5 w-3.5" />
                        {t('gallery.openInSearch')}
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex items-center justify-center overflow-hidden relative">
                {/* Navigation Arrows */}
                {documents.length > 1 && (
                    <>
                        <Button
                            variant="ghost"
                            size="lg"
                            className="absolute left-4 z-10 h-16 w-16 rounded-full bg-black/30 hover:bg-black/50"
                            onClick={goToPrev}
                        >
                            <ChevronLeft className="h-8 w-8 text-white" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="lg"
                            className="absolute right-4 z-10 h-16 w-16 rounded-full bg-black/30 hover:bg-black/50"
                            onClick={goToNext}
                        >
                            <ChevronRight className="h-8 w-8 text-white" />
                        </Button>
                    </>
                )}

                {/* Media Display */}
                <div className={cn("max-w-full max-h-full overflow-auto p-4 flex gap-4", showOcr && "items-start")}>
                    <div className="flex-1 flex items-center justify-center">
                    {isVideo ? (
                        <video
                            src={mediaUrl}
                            controls
                            autoPlay={isPlaying}
                            className="max-h-[80vh] max-w-full rounded-lg shadow-2xl"
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                        />
                    ) : isImage ? (
                        <img
                            src={mediaUrl}
                            alt={currentDoc.file_name}
                            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                            className="max-h-[80vh] max-w-full object-contain transition-transform duration-200 rounded-lg shadow-2xl"
                            draggable={false}
                        />
                    ) : (
                        <div className="text-white text-center">
                            <p>{t('viewer.unsupportedFormat')}</p>
                            <a href={mediaUrl} target="_blank" className="text-primary underline">
                                {t('viewer.download')}
                            </a>
                        </div>
                    )}
                    </div>

                    {/* OCR Text Overlay */}
                    {showOcr && ocrText !== null && (
                        <div className="w-80 max-h-[80vh] overflow-auto rounded-lg bg-black/70 backdrop-blur-sm border border-white/10 p-4 shrink-0">
                            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">OCR</h4>
                            <pre className="text-sm text-white/90 whitespace-pre-wrap font-mono leading-relaxed">
                                {ocrText || 'No text detected'}
                            </pre>
                        </div>
                    )}
                </div>
            </div>

            {/* Thumbnail Strip */}
            {documents.length > 1 && (
                <div className="p-4 bg-black/50 overflow-x-auto">
                    <div className="flex gap-2 justify-center">
                        {documents.slice(Math.max(0, currentIndex - 5), currentIndex + 6).map((doc, idx) => {
                            const actualIndex = Math.max(0, currentIndex - 5) + idx
                            const isActive = actualIndex === currentIndex
                            const thumbUrl = `${API_BASE}/documents/${doc.id}/thumbnail`
                            return (
                                <button
                                    key={doc.id}
                                    onClick={() => { setCurrentIndex(actualIndex); setZoom(1) }}
                                    className={cn(
                                        "w-16 h-16 rounded overflow-hidden border-2 transition-all flex-shrink-0",
                                        isActive ? "border-primary ring-2 ring-primary/50" : "border-transparent opacity-60 hover:opacity-100"
                                    )}
                                >
                                    <img
                                        src={thumbUrl}
                                        alt={doc.file_name}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = getDocumentFileUrl(doc.id)
                                        }}
                                    />
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
