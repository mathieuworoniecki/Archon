import { useState, useEffect } from 'react'
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, FileText, Image as ImageIcon, FileCode, ExternalLink, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getDocumentFileUrl, getDocument } from '@/lib/api'
import { FavoriteButton } from '@/components/favorites/FavoriteButton'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

interface DocumentViewerProps {
    documentId: number | null
    searchQuery?: string
}

function Breadcrumb({ filePath }: { filePath: string }) {
    const parts = filePath.split('/').filter(Boolean)
    // Show last 4 segments max
    const visibleParts = parts.length > 4 ? ['...', ...parts.slice(-4)] : parts

    return (
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b bg-muted/30 text-xs text-muted-foreground overflow-hidden">
            <Home className="h-3 w-3 flex-shrink-0" />
            {visibleParts.map((part, i) => (
                <span key={i} className="flex items-center gap-0.5">
                    <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-40" />
                    <span className={`truncate ${i === visibleParts.length - 1 ? 'text-foreground font-medium' : ''}`}>
                        {part}
                    </span>
                </span>
            ))}
        </div>
    )
}

export function DocumentViewer({ documentId, searchQuery }: DocumentViewerProps) {
    const [docInfo, setDocInfo] = useState<{ file_name: string; file_type: string; file_path?: string; text_content?: string } | null>(null)
    const [numPages, setNumPages] = useState<number>(0)
    const [pageNumber, setPageNumber] = useState(1)
    const [scale, setScale] = useState(1.0)
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        if (!documentId) {
            setDocInfo(null)
            return
        }

        setIsLoading(true)
        getDocument(documentId)
            .then((doc) => {
                setDocInfo(doc)
                setPageNumber(1)
            })
            .catch(console.error)
            .finally(() => setIsLoading(false))
    }, [documentId])

    if (!documentId) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Sélectionnez un document</p>
                <p className="text-sm">Cliquez sur un résultat pour le visualiser</p>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    const fileUrl = getDocumentFileUrl(documentId)

    const highlightText = (text: string, query: string) => {
        if (!query) return text
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
        return text.replace(regex, '<mark>$1</mark>')
    }

    // PDF Viewer
    if (docInfo?.file_type === 'pdf') {
        return (
            <div className="flex flex-col h-full">
                {docInfo.file_path && <Breadcrumb filePath={docInfo.file_path} />}
                {/* Toolbar */}
                <div className="flex items-center justify-between p-2 border-b bg-card">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                            disabled={pageNumber <= 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm">
                            {pageNumber} / {numPages}
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                            disabled={pageNumber >= numPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <FavoriteButton documentId={documentId} size="sm" />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setScale(Math.max(0.5, scale - 0.25))}
                        >
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <span className="text-sm w-16 text-center">{Math.round(scale * 100)}%</span>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setScale(Math.min(2.5, scale + 0.25))}
                        >
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => window.open(fileUrl, '_blank')}
                        >
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* PDF Content */}
                <ScrollArea className="flex-1 pdf-container">
                    <div className="p-4 flex justify-center">
                        <PDFDocument
                            file={fileUrl}
                            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                            loading={
                                <div className="flex items-center justify-center p-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                            }
                        >
                            <Page
                                pageNumber={pageNumber}
                                scale={scale}
                                renderTextLayer={true}
                                renderAnnotationLayer={true}
                            />
                        </PDFDocument>
                    </div>
                </ScrollArea>
            </div>
        )
    }

    // Image Viewer
    if (docInfo?.file_type === 'image') {
        return (
            <div className="flex flex-col h-full">
                {docInfo.file_path && <Breadcrumb filePath={docInfo.file_path} />}
                <div className="flex items-center justify-between p-2 border-b bg-card">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">{docInfo.file_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <FavoriteButton documentId={documentId} size="sm" />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setScale(Math.max(0.25, scale - 0.25))}
                        >
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <span className="text-sm w-16 text-center">{Math.round(scale * 100)}%</span>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setScale(Math.min(3, scale + 0.25))}
                        >
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                <ScrollArea className="flex-1">
                    <div className="p-4 flex justify-center">
                        <img
                            src={fileUrl}
                            alt={docInfo.file_name}
                            style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
                            className="max-w-full transition-transform"
                        />
                    </div>
                </ScrollArea>
            </div>
        )
    }

    // Text Viewer
    return (
        <div className="flex flex-col h-full">
            {docInfo?.file_path && <Breadcrumb filePath={docInfo.file_path} />}
            <div className="flex items-center justify-between p-2 border-b bg-card">
                <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4" />
                    <span className="text-sm font-medium">{docInfo?.file_name}</span>
                </div>
                <FavoriteButton documentId={documentId} size="sm" />
            </div>
            <ScrollArea className="flex-1">
                <pre
                    className="p-4 text-sm whitespace-pre-wrap font-mono"
                    dangerouslySetInnerHTML={{
                        __html: highlightText(docInfo?.text_content || '', searchQuery || '')
                    }}
                />
            </ScrollArea>
        </div>
    )
}
