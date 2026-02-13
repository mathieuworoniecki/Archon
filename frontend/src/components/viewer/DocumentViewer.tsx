import { useState, useEffect } from 'react'
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, FileText, Image as ImageIcon, FileCode, ExternalLink, Home, Users, Building2, MapPin, Hash, ChevronDown, ChevronUp, ShieldAlert, Video, Database, Clock, SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getDocumentFileUrl, getDocument } from '@/lib/api'
import { FavoriteButton } from '@/components/favorites/FavoriteButton'
import { authFetch } from '@/lib/auth'
import { API_BASE } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/contexts/I18nContext'
import { DeepAnalysisPanel } from './DeepAnalysisPanel'
import { useStats } from '@/hooks/useStats'
import { useProject } from '@/contexts/ProjectContext'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

interface DocumentViewerProps {
    documentId: number | null
    searchQuery?: string
    onNavigatePrevious?: () => void
    onNavigateNext?: () => void
    canNavigatePrevious?: boolean
    canNavigateNext?: boolean
}

interface DocumentEntity {
    id: number
    text: string
    type: string
    count: number
    document_id: number
}

const documentDetailsCache = new Map<number, { file_name: string; file_type: string; file_path?: string; text_content?: string }>()
const redactionCache = new Map<number, { redaction_status: string; redaction_score: number } | null>()
const entityCache = new Map<number, DocumentEntity[]>()

const ENTITY_TYPE_CONFIG: Record<string, { icon: typeof Users; color: string; labelKey: string }> = {
    PER: { icon: Users, color: 'text-blue-400 bg-blue-400/10', labelKey: 'viewer.entityPER' },
    ORG: { icon: Building2, color: 'text-emerald-400 bg-emerald-400/10', labelKey: 'viewer.entityORG' },
    LOC: { icon: MapPin, color: 'text-amber-400 bg-amber-400/10', labelKey: 'viewer.entityLOC' },
    MISC: { icon: Hash, color: 'text-purple-400 bg-purple-400/10', labelKey: 'viewer.entityMISC' },
}

function isEditableTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null
    if (!element) return false
    const tag = element.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
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

/** Compact redaction status badge */
function RedactionBadge({ documentId }: { documentId: number }) {
    const [status, setStatus] = useState<{ redaction_status: string; redaction_score: number } | null>(null)
    const { t } = useTranslation()

    useEffect(() => {
        const cached = redactionCache.get(documentId)
        if (cached !== undefined) {
            setStatus(cached)
            return
        }
        authFetch(`${API_BASE}/documents/${documentId}/redaction`)
            .then(res => res.ok ? res.json() : null)
            .then((payload) => {
                redactionCache.set(documentId, payload)
                setStatus(payload)
            })
            .catch(() => {
                redactionCache.set(documentId, null)
                setStatus(null)
            })
    }, [documentId])

    if (!status || status.redaction_status === 'none') return null

    const isConfirmed = status.redaction_status === 'confirmed'

    return (
        <Badge
            variant="outline"
            className={cn(
                "h-6 gap-1 text-[10px] font-medium",
                isConfirmed
                    ? 'border-red-500/50 text-red-400 bg-red-500/10'
                    : 'border-amber-500/50 text-amber-400 bg-amber-500/10'
            )}
            title={`${t('viewer.confidence')}: ${Math.round(status.redaction_score * 100)}%`}
        >
            <ShieldAlert className="h-3 w-3" />
            {isConfirmed ? t('viewer.redacted') : t('viewer.redactedMaybe')}
        </Badge>
    )
}

/** Collapsible "People Mentioned" panel for a document */
function EntityPanel({ documentId }: { documentId: number }) {
    const [entities, setEntities] = useState<DocumentEntity[]>([])
    const [isOpen, setIsOpen] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const { t } = useTranslation()

    useEffect(() => {
        const cached = entityCache.get(documentId)
        if (cached) {
            setEntities(cached)
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        authFetch(`${API_BASE}/entities/document/${documentId}`)
            .then(res => res.ok ? res.json() : [])
            .then((payload) => {
                entityCache.set(documentId, payload)
                setEntities(payload)
            })
            .catch(() => setEntities([]))
            .finally(() => setIsLoading(false))
    }, [documentId])

    if (!isLoading && entities.length === 0) return null

    // Group by type
    const grouped = entities.reduce<Record<string, DocumentEntity[]>>((acc, e) => {
        (acc[e.type] = acc[e.type] || []).push(e)
        return acc
    }, {})

    return (
        <div className="border-t">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
            >
                <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {t('viewer.entitiesMentioned')}
                    {entities.length > 0 && (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {entities.length}
                        </Badge>
                    )}
                </span>
                {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {isOpen && (
                <div className="px-3 pb-3 space-y-2">
                    {isLoading ? (
                        <div className="flex justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        Object.entries(grouped).map(([type, items]) => {
                            const config = ENTITY_TYPE_CONFIG[type]
                            if (!config) return null
                            const Icon = config.icon
                            return (
                                <div key={type}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Icon className={cn("h-3 w-3", config.color.split(' ')[0])} />
                                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                            {t(config.labelKey)}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {items.sort((a, b) => b.count - a.count).map(entity => (
                                            <a
                                                key={entity.id}
                                                href={`/entities?search=${encodeURIComponent(entity.text)}`}
                                                className={cn(
                                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs",
                                                    "border transition-colors hover:bg-accent",
                                                    config.color
                                                )}
                                            >
                                                {entity.text}
                                                {entity.count > 1 && (
                                                    <span className="text-[9px] opacity-60">×{entity.count}</span>
                                                )}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}

// ── Project Overview Panel ── shown when no document is selected
function ProjectOverviewPanel() {
    const { stats, isLoading } = useStats()
    const { selectedProject } = useProject()
    const { t } = useTranslation()

    if (isLoading || !stats) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
            </div>
        )
    }

    const byType = stats.documents_by_type
    const totalDocs = stats.total_documents
    const types = [
        { key: 'pdf' as const, label: 'PDF', count: byType.pdf, icon: FileText, color: 'bg-red-500' },
        { key: 'image' as const, label: 'Images', count: byType.image, icon: ImageIcon, color: 'bg-blue-500' },
        { key: 'text' as const, label: 'Text', count: byType.text, icon: FileCode, color: 'bg-green-500' },
        { key: 'video' as const, label: 'Video', count: byType.video, icon: Video, color: 'bg-purple-500' },
        { key: 'unknown' as const, label: t('browse.otherTypes'), count: byType.unknown, icon: Database, color: 'bg-gray-500' },
    ].filter(t => t.count > 0)

    const formatBytes = (bytes: number): string => {
        if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
        if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
        if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
        return `${bytes} B`
    }

    return (
        <div className="flex flex-col items-center justify-center h-full px-8 text-muted-foreground">
            <div className="w-full max-w-sm space-y-6">
                {/* Header */}
                <div className="text-center space-y-1">
                    <h3 className="text-lg font-semibold text-foreground">
                        {selectedProject?.name || 'Archon'}
                    </h3>
                    <p className="text-sm">{t('viewer.noDocumentHint')}</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                        <p className="text-2xl font-bold text-foreground tabular-nums">{totalDocs.toLocaleString()}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t('common.documents')}</p>
                    </div>
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                        <p className="text-2xl font-bold text-foreground tabular-nums">{formatBytes(stats.total_file_size_bytes)}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t('viewer.totalSize')}</p>
                    </div>
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                        <p className="text-2xl font-bold text-foreground tabular-nums">{stats.total_scans}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t('nav.scans')}</p>
                    </div>
                </div>

                {/* Type Distribution */}
                <div className="rounded-lg border bg-card/50 p-4 space-y-3">
                    <p className="text-xs font-medium text-foreground">{t('viewer.typeDistribution')}</p>
                    <div className="space-y-2">
                        {types.map(({ key, label, count, icon: Icon, color }) => {
                            const pct = totalDocs > 0 ? (count / totalDocs) * 100 : 0
                            return (
                                <div key={key} className="flex items-center gap-2">
                                    <Icon className="h-3.5 w-3.5 shrink-0" />
                                    <span className="text-xs w-14 shrink-0">{label}</span>
                                    <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                                        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] tabular-nums w-12 text-right">{count.toLocaleString()}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Last Scan */}
                {stats.last_scan_date && (
                    <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{t('viewer.lastScan')}: {new Date(stats.last_scan_date).toLocaleDateString()}</span>
                    </div>
                )}
            </div>
        </div>
    )
}

export function DocumentViewer({
    documentId,
    searchQuery,
    onNavigatePrevious,
    onNavigateNext,
    canNavigatePrevious = true,
    canNavigateNext = true,
}: DocumentViewerProps) {
    const [docInfo, setDocInfo] = useState<{ file_name: string; file_type: string; file_path?: string; text_content?: string } | null>(null)
    const [numPages, setNumPages] = useState<number>(0)
    const [pageNumber, setPageNumber] = useState(1)
    const [scale, setScale] = useState(1.0)
    const [isLoading, setIsLoading] = useState(false)
    const { t } = useTranslation()

    const canGoPrevious = typeof onNavigatePrevious === 'function' && canNavigatePrevious
    const canGoNext = typeof onNavigateNext === 'function' && canNavigateNext

    useEffect(() => {
        if (!documentId) {
            setDocInfo(null)
            return
        }

        const cached = documentDetailsCache.get(documentId)
        if (cached) {
            setDocInfo(cached)
            setPageNumber(1)
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        getDocument(documentId)
            .then((doc) => {
                documentDetailsCache.set(documentId, doc)
                setDocInfo(doc)
                setPageNumber(1)
            })
            .catch(() => setDocInfo(null))
            .finally(() => setIsLoading(false))
    }, [documentId])

    useEffect(() => {
        if (!documentId || (!canGoPrevious && !canGoNext)) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return
            if (event.metaKey || event.ctrlKey || event.altKey) return
            if (isEditableTarget(event.target)) return
            if (window.getSelection()?.type === 'Range') return

            if (event.key === 'ArrowLeft' && canGoPrevious) {
                event.preventDefault()
                onNavigatePrevious?.()
            } else if (event.key === 'ArrowRight' && canGoNext) {
                event.preventDefault()
                onNavigateNext?.()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [canGoNext, canGoPrevious, documentId, onNavigateNext, onNavigatePrevious])

    const documentNavigationControls = (canGoPrevious || canGoNext) ? (
        <div className="flex items-center gap-1 border rounded-md p-0.5 bg-background/50" aria-label="Document navigation">
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onNavigatePrevious?.()}
                disabled={!canGoPrevious}
                title={t('viewer.prevDocument')}
            >
                <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onNavigateNext?.()}
                disabled={!canGoNext}
                title={t('viewer.nextDocument')}
            >
                <SkipForward className="h-3.5 w-3.5" />
            </Button>
        </div>
    ) : null

    if (!documentId) {
        return <ProjectOverviewPanel />
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
                        {documentNavigationControls}
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
                        <RedactionBadge documentId={documentId} />
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

                {/* Entity Panel */}
                <EntityPanel documentId={documentId} />
            <DeepAnalysisPanel documentId={documentId} />

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
                        {documentNavigationControls}
                        <ImageIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">{docInfo.file_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <RedactionBadge documentId={documentId} />
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
                {/* Entity Panel */}
                <EntityPanel documentId={documentId} />
            <DeepAnalysisPanel documentId={documentId} />
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
                    {documentNavigationControls}
                    <FileCode className="h-4 w-4" />
                    <span className="text-sm font-medium">{docInfo?.file_name}</span>
                </div>
                <div className="flex items-center gap-2">
                    <RedactionBadge documentId={documentId} />
                    <FavoriteButton documentId={documentId} size="sm" />
                </div>
            </div>
            {/* Entity Panel */}
            <EntityPanel documentId={documentId} />
            <DeepAnalysisPanel documentId={documentId} />
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
