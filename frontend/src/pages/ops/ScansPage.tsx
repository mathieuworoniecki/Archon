import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
    Scan, FolderSearch, CheckCircle2, XCircle, Clock, RefreshCw, 
    FileText, Play, Database, Zap, Loader2, FileDown,
    Eye, Square, Trash2, Plus, Pencil, ArrowRight, Image
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useScanProgress } from '@/hooks/useScanProgress'
import { createScan, estimateScan, ScanEstimate, type ScanRecord } from '@/lib/api'
import { ScanDetailModal } from '@/components/scan/ScanDetailModal'
import { ScanConfigPanel } from '@/components/scan/ScanConfigPanel'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/contexts/I18nContext'
import { useProject } from '@/contexts/ProjectContext'
import { authFetch } from '@/lib/auth'
import { toast } from 'sonner'
import { formatDuration, formatEstimatedNumber, formatNumber } from '@/lib/formatters'
import { ScanRowSkeleton } from '@/components/ui/skeleton'

const DELETE_DELAY_MS = 5000

export function ScansPage() {
    const navigate = useNavigate()
    const [scans, setScans] = useState<ScanRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const { t } = useTranslation()
    const {
        selectedProject: contextProject,
        selectProject,
        projects,
        isLoading: isLoadingProjects,
        refetchProjects,
    } = useProject()
    
    // New scan
    const [activeScanId, setActiveScanId] = useState<number | null>(null)
    const [isStarting, setIsStarting] = useState(false)
    
    // Options
    const [enableEmbeddings, setEnableEmbeddings] = useState<boolean>(() => {
        try {
            return localStorage.getItem('archon_scan_enable_embeddings') === 'true'
        } catch {
            return false
        }
    })
    
    // Estimation
    const [estimate, setEstimate] = useState<ScanEstimate | null>(null)
    const [isEstimating, setIsEstimating] = useState(false)
    
    // Modals
    const [selectedScanId, setSelectedScanId] = useState<number | null>(null)
    const [showScanDetail, setShowScanDetail] = useState(false)
    const [scanToDelete, setScanToDelete] = useState<number | null>(null)
    const [scanToRename, setScanToRename] = useState<ScanRecord | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [isExportingSummary, setIsExportingSummary] = useState(false)
    const pendingDeletionTimersRef = useRef<Map<string, number>>(new Map())

    const { progress, isComplete } = useScanProgress(activeScanId)

    useEffect(() => {
        fetchScans()
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem('archon_scan_enable_embeddings', String(enableEmbeddings))
        } catch {
            // Ignore storage errors.
        }
    }, [enableEmbeddings])

    useEffect(() => {
        return () => {
            pendingDeletionTimersRef.current.forEach((timerId) => window.clearTimeout(timerId))
            pendingDeletionTimersRef.current.clear()
        }
    }, [])

    useEffect(() => {
        const projectPath = contextProject?.path
        if (!projectPath) {
            setEstimate(null)
            return
        }

        let cancelled = false
        const fetchEstimate = async () => {
            setIsEstimating(true)
            try {
                const est = await estimateScan(projectPath)
                if (!cancelled) setEstimate(est)
            } catch {
                if (!cancelled) setEstimate(null)
            } finally {
                if (!cancelled) setIsEstimating(false)
            }
        }
        fetchEstimate()

        return () => {
            cancelled = true
        }
    }, [contextProject?.path])

    const handleProjectChange = (projectName: string) => {
        const project = projects.find((item) => item.name === projectName)
        if (project) {
            selectProject(project)
        }
    }

    const fetchScans = async () => {
        try {
            const response = await authFetch('/api/scan/')
            if (response.ok) {
                const data = await response.json()
                const scanList = Array.isArray(data) ? data : []
                setScans(scanList)
                const running = scanList.find((s: ScanRecord) => s.status === 'running')
                if (running) {
                    setActiveScanId(running.id)
                } else {
                    setActiveScanId(null)
                }
            }
        } catch {
            // silently fail — UI shows stale data until next fetch
        } finally {
            setIsLoading(false)
        }
    }

    const handleStartScan = async () => {
        if (!contextProject?.path) return
        setIsStarting(true)
        try {
            const scan = await createScan(contextProject.path, enableEmbeddings)
            setActiveScanId(scan.id)
            await fetchScans()
            toast.success(t('scans.starting'))
        } catch {
            toast.error(t('scans.toast.startFailed'))
        } finally {
            setIsStarting(false)
        }
    }

    const handleCancelScan = async (scanId: number) => {
        try {
            await authFetch(`/api/scan/${scanId}/cancel`, { method: 'POST' })
            await fetchScans()
            if (scanId === activeScanId) setActiveScanId(null)
            toast.success(t('scans.toast.cancelled'))
        } catch {
            toast.error(t('scans.toast.cancelFailed'))
        }
    }

    const handleResumeScan = async (scanId: number) => {
        try {
            await authFetch(`/api/scan/${scanId}/resume`, { method: 'POST' })
            await fetchScans()
            toast.success(t('scans.toast.resumed'))
        } catch {
            toast.error(t('scans.toast.resumeFailed'))
        }
    }

    const clearPendingDeletion = (key: string): boolean => {
        const timerId = pendingDeletionTimersRef.current.get(key)
        if (timerId === undefined) return false
        window.clearTimeout(timerId)
        pendingDeletionTimersRef.current.delete(key)
        return true
    }

    const undoPendingDeletion = (key: string, successMessage: string) => {
        if (clearPendingDeletion(key)) {
            toast.success(successMessage)
        }
    }

    const executeDeleteScan = async (scanId: number) => {
        try {
            await authFetch(`/api/scan/${scanId}`, { method: 'DELETE' })
            await fetchScans()
            toast.success(t('scans.toast.deleted'))
        } catch {
            toast.error(t('dashboard.toast.deleteFailed'))
        }
    }

    const handleDeleteScan = (scanId: number) => {
        const key = `scan:${scanId}`
        if (pendingDeletionTimersRef.current.has(key)) {
            setScanToDelete(null)
            toast.message(`La suppression du scan #${scanId} est déjà planifiée.`)
            return
        }

        const timerId = window.setTimeout(() => {
            pendingDeletionTimersRef.current.delete(key)
            void executeDeleteScan(scanId)
        }, DELETE_DELAY_MS)

        pendingDeletionTimersRef.current.set(key, timerId)
        setScanToDelete(null)

        toast.message(`Suppression du scan #${scanId} dans 5 secondes.`, {
            description: 'Cliquez sur Undo pour annuler.',
            action: {
                label: 'Undo',
                onClick: () => undoPendingDeletion(key, `Suppression du scan #${scanId} annulée.`),
            },
            duration: DELETE_DELAY_MS + 1000,
        })
    }

    const openRenameDialog = (scan: ScanRecord) => {
        setScanToRename(scan)
        setRenameValue(scan.label || scan.path.split('/').pop() || '')
    }

    const handleRenameScan = async () => {
        if (!scanToRename) return
        const normalizedLabel = renameValue.trim()
        if (!normalizedLabel) {
            toast.error(t('scans.toast.nameRequired'))
            return
        }
        try {
            await authFetch(`/api/scan/${scanToRename.id}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: normalizedLabel })
            })
            await fetchScans()
            setScanToRename(null)
            setRenameValue('')
            toast.success(t('scans.toast.renamed'))
        } catch {
            toast.error(t('scans.toast.renameFailed'))
        }
    }

    const getStatusBadge = (status: string) => {
        const styles: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', label: string }> = {
            completed: { variant: 'default', label: t('scans.completed') },
            running: { variant: 'secondary', label: t('scans.running') },
            pending: { variant: 'outline', label: t('scans.pending') },
            failed: { variant: 'destructive', label: t('scans.failed') },
            cancelled: { variant: 'outline', label: t('scans.cancelled') },
        }
        const s = styles[status] || { variant: 'outline', label: status }
        return <Badge variant={s.variant}>{s.label}</Badge>
    }

    const getTypeLabel = (type: string) => {
        const key = type.toLowerCase()
        const typeLabels: Record<string, string> = {
            pdf: 'PDF',
            image: t('scans.images'),
            text: t('scans.text'),
            video: t('scans.videos'),
            email: t('scans.emails'),
            unknown: t('scans.unknownType'),
        }
        return typeLabels[key] || key.toUpperCase()
    }

    const handleExportFromSummary = async () => {
        if (!activeScanId) {
            navigate('/')
            return
        }

        setIsExportingSummary(true)
        try {
            const documentIds: number[] = []
            const pageSize = 200
            let offset = 0
            let total = 0

            do {
                const params = new URLSearchParams({
                    scan_id: String(activeScanId),
                    skip: String(offset),
                    limit: String(pageSize),
                    sort_by: 'indexed_desc',
                })
                const listResponse = await authFetch(`/api/documents/?${params.toString()}`)
                if (!listResponse.ok) throw new Error('documents_list_failed')

                const payload = await listResponse.json() as {
                    documents?: Array<{ id: number }>
                    total?: number
                }
                const batch = Array.isArray(payload.documents) ? payload.documents : []
                const batchIds = batch
                    .map((doc) => doc.id)
                    .filter((id): id is number => Number.isInteger(id))

                documentIds.push(...batchIds)
                total = typeof payload.total === 'number' ? payload.total : Math.max(total, offset + batch.length)
                offset += batch.length

                if (batch.length === 0) break
            } while (offset < total)

            if (documentIds.length === 0) {
                toast.message(t('scans.postScanExportUnavailable'))
                navigate('/')
                return
            }

            const exportResponse = await authFetch('/api/export/csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    document_ids: documentIds,
                    include_content: false,
                    include_metadata: true,
                }),
            })

            if (!exportResponse.ok) throw new Error('export_failed')

            const blob = await exportResponse.blob()
            const disposition = exportResponse.headers.get('content-disposition') || ''
            const filenameMatch = disposition.match(/filename="?([^"]+)"?/)
            const filename = filenameMatch?.[1] || `archon-scan-${activeScanId}-export.csv`

            const blobUrl = window.URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = blobUrl
            anchor.download = filename
            document.body.appendChild(anchor)
            anchor.click()
            document.body.removeChild(anchor)
            window.URL.revokeObjectURL(blobUrl)

            toast.success(t('scans.postScanExportReady').replace('{count}', formatNumber(documentIds.length)))
        } catch {
            toast.message(t('scans.postScanExportFallback'))
            navigate('/')
        } finally {
            setIsExportingSummary(false)
        }
    }

    const openSearchFallback = () => {
        navigate('/')
    }

    const activeScanPath = scans.find((scan) => scan.id === activeScanId)?.path ?? contextProject?.path ?? '-'
    const processedFiles = progress?.processed_files ?? 0
    const failedFiles = progress?.failed_files ?? 0
    const successfulFiles = Math.max(processedFiles - failedFiles, 0)
    const topTypes = progress?.type_counts
        ? Object.entries(progress.type_counts)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
        : []
    const totalTypeCount = progress?.type_counts
        ? Object.values(progress.type_counts).reduce((sum, count) => sum + count, 0)
        : 0
    const canExportFromSummary = isComplete && successfulFiles > 0

    return (
        <div className="h-full p-6 space-y-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <Scan className="h-8 w-8 text-primary" />
                        <div>
                            <h1 className="text-2xl font-bold">{t('scans.title')}</h1>
                            <p className="text-muted-foreground text-sm">{t('scans.subtitle')}</p>
                        </div>
                    </div>
                    <Button onClick={() => { fetchScans(); refetchProjects() }} variant="ghost" size="sm">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t('scans.refresh')}
                    </Button>
                </div>

                {/* SECTION 1: Active Scan Hero */}
                {activeScanId && progress && (
                    <Card className="border-primary/50 border-2 mb-6 overflow-hidden">
                        {/* Animated top bar */}
                        <div className="h-1 bg-gradient-to-r from-primary via-blue-500 to-primary" 
                             style={{ backgroundSize: '200% 100%', animation: isComplete ? 'none' : 'shimmer 2s linear infinite' }} />
                        
                        <CardContent className="p-6">
                            {/* Header row */}
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2.5 rounded-xl ${isComplete ? 'bg-green-500/20' : 'bg-primary/15'}`}>
                                        {isComplete ? (
                                            <CheckCircle2 className="h-6 w-6 text-green-500" />
                                        ) : (
                                            <Loader2 className="h-6 w-6 text-primary animate-spin" />
                                        )}
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold">
                                            {isComplete ? t('scans.scanComplete') : t('scans.scanInProgress')}
                                        </h2>
                                        <p className="text-sm text-muted-foreground font-mono">{activeScanPath}</p>
                                    </div>
                                </div>
                                {!isComplete && (
                                    <Button 
                                        variant="outline" 
                                        onClick={() => handleCancelScan(activeScanId)}
                                        className="text-orange-500 border-orange-500/50 hover:bg-orange-500/10"
                                    >
                                        <Square className="h-4 w-4 mr-2" />
                                        {t('scans.stop')}
                                    </Button>
                                )}
                            </div>

                            {/* Phase Stepper */}
                            <div className="flex items-center mb-5 px-2">
                                {[
                                    { key: 'detection', label: t('scans.phaseDetection'), icon: FolderSearch },
                                    { key: 'processing', label: t('scans.phaseProcessing'), icon: Zap },
                                    { key: 'indexing', label: t('scans.phaseIndexing'), icon: Database },
                                    { key: 'complete', label: t('scans.phaseComplete'), icon: CheckCircle2 },
                                ].map((phase, i, arr) => {
                                    const phases = ['detection', 'processing', 'indexing', 'complete']
                                    const currentIdx = phases.indexOf(progress.phase || 'detection')
                                    const phaseIdx = phases.indexOf(phase.key)
                                    const isActive = phaseIdx === currentIdx
                                    const isDone = phaseIdx < currentIdx
                                    const Icon = phase.icon

                                    return (
                                        <div key={phase.key} className="flex items-center flex-1">
                                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-500
                                                ${isActive ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-105' : ''}
                                                ${isDone ? 'bg-green-500/15 text-green-500' : ''}
                                                ${!isActive && !isDone ? 'bg-muted text-muted-foreground' : ''}
                                            `}>
                                                {isDone ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                ) : (
                                                    <Icon className={`h-3.5 w-3.5 ${isActive ? 'animate-pulse' : ''}`} />
                                                )}
                                                <span className="hidden sm:inline">{phase.label}</span>
                                            </div>
                                            {i < arr.length - 1 && (
                                                <div className={`flex-1 h-0.5 mx-2 rounded transition-colors duration-500
                                                    ${isDone ? 'bg-green-500/40' : 'bg-muted'}
                                                `} />
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                            
                            {/* Progress Bar */}
                            {progress.phase === 'detection' ? (
                                <div className="relative h-3 mb-5 bg-muted rounded-full overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/60 to-transparent rounded-full"
                                         style={{ animation: 'shimmer 1.5s ease-in-out infinite' }} />
                                </div>
                            ) : (
                                <div className="relative h-3 mb-5 bg-muted rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-primary to-blue-500 rounded-full transition-all duration-700 ease-out"
                                        style={{ width: `${Math.min(progress.progress_percent, 100)}%` }}
                                    />
                                    {!isComplete && (
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full"
                                             style={{ animation: 'shimmer 2s linear infinite' }} />
                                    )}
                                </div>
                            )}

                            {/* 6-Metric Grid */}
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-5">
                                <div className="text-center p-3 rounded-lg bg-muted/50 border border-border/50">
                                    <div className="text-2xl font-bold text-primary tabular-nums">
                                        {formatNumber(progress.processed_files)}
                                        <span className="text-base text-muted-foreground font-normal">/{formatNumber(progress.total_files)}</span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.processed')}</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-muted/50 border border-border/50">
                                    <div className="text-2xl font-bold text-blue-500 tabular-nums">
                                        {progress.files_per_second > 0 ? progress.files_per_second.toFixed(1) : '—'}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.filesPerSec')}</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-muted/50 border border-border/50">
                                    <div className="text-2xl font-bold tabular-nums">
                                        {progress.eta_seconds != null ? formatDuration('', undefined, progress.eta_seconds) : '—'}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.eta')}</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-muted/50 border border-border/50">
                                    <div className={`text-2xl font-bold tabular-nums ${(progress.failed_files || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                        {progress.failed_files || 0}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.errors')}</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-muted/50 border border-border/50">
                                    <div className="text-2xl font-bold text-muted-foreground tabular-nums">
                                        {progress.skipped_files || 0}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.skipped')}</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-muted/50 border border-border/50">
                                    <div className="text-2xl font-bold tabular-nums">
                                        {formatDuration('', undefined, progress.elapsed_seconds || 0)}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.elapsed')}</div>
                                </div>
                            </div>

                            {/* Type Breakdown Bar + Activity Feed */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* File Type Breakdown */}
                                {progress.type_counts && Object.keys(progress.type_counts).length > 0 && (
                                    <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                                        <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">{t('scans.typeBreakdown')}</div>
                                        <div className="flex h-3 rounded-full overflow-hidden mb-2">
                                            {(() => {
                                                const counts = progress.type_counts!
                                                const total = Object.values(counts).reduce((a, b) => a + b, 0)
                                                if (total === 0) return null
                                                const colors: Record<string, string> = {
                                                    pdf: 'bg-red-500', image: 'bg-blue-500', text: 'bg-green-500',
                                                    video: 'bg-purple-500', email: 'bg-orange-500', unknown: 'bg-gray-400'
                                                }
                                                return Object.entries(counts).map(([type, count]) => (
                                                    <div
                                                        key={type}
                                                        className={`${colors[type] || 'bg-gray-400'} transition-all duration-500`}
                                                        style={{ width: `${(count / total) * 100}%` }}
                                                        title={`${type}: ${count}`}
                                                    />
                                                ))
                                            })()}
                                        </div>
                                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                                            {Object.entries(progress.type_counts).map(([type, count]) => {
                                                const dotColors: Record<string, string> = {
                                                    pdf: 'bg-red-500', image: 'bg-blue-500', text: 'bg-green-500',
                                                    video: 'bg-purple-500', email: 'bg-orange-500', unknown: 'bg-gray-400'
                                                }
                                                return (
                                                    <div key={type} className="flex items-center gap-1 text-xs text-muted-foreground">
                                                        <div className={`w-2 h-2 rounded-full ${dotColors[type] || 'bg-gray-400'}`} />
                                                        <span className="capitalize">{type}</span>
                                                        <span className="font-medium text-foreground">{count}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Activity Feed */}
                                <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                                    <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">{t('scans.recentActivity')}</div>
                                    {progress.recent_files && progress.recent_files.length > 0 ? (
                                        <div className="space-y-1">
                                            {progress.recent_files.slice().reverse().map((file, i) => {
                                                const ext = file.split('.').pop()?.toLowerCase() || ''
                                                const typeColors: Record<string, string> = {
                                                    pdf: 'text-red-400', jpg: 'text-blue-400', jpeg: 'text-blue-400',
                                                    png: 'text-blue-400', gif: 'text-blue-400', bmp: 'text-blue-400',
                                                    txt: 'text-green-400', doc: 'text-green-400', docx: 'text-green-400',
                                                    mp4: 'text-purple-400', avi: 'text-purple-400',
                                                    eml: 'text-orange-400', pst: 'text-orange-400', mbox: 'text-orange-400'
                                                }
                                                return (
                                                    <div key={`${file}-${i}`}
                                                         className={`flex items-center gap-2 text-xs py-0.5 transition-opacity duration-300
                                                             ${i === 0 ? 'opacity-100 text-foreground' : 'opacity-50 text-muted-foreground'}`}>
                                                        <FileText className={`h-3 w-3 flex-shrink-0 ${typeColors[ext] || 'text-muted-foreground'}`} />
                                                        <span className="truncate font-mono">{file}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            {progress.current_file ? (
                                                <>
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    <span className="truncate font-mono">{progress.current_file}</span>
                                                </>
                                            ) : (
                                                <span className="italic">{t('scans.noActivity')}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {isComplete && (
                                <div className="mt-4 space-y-3 rounded-lg border border-green-500/25 bg-green-500/5 p-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                                        <span className="font-medium">{t('scans.postScanSummaryTitle')}</span>
                                        <Badge variant="outline" className="border-green-500/40 text-green-600 dark:text-green-400">
                                            {t('scans.completed')}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground sm:ml-auto">
                                            {t('scans.postScanSummarySubtitle')}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                                            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t('scans.postScanProcessed')}</div>
                                            <div className="text-lg font-semibold tabular-nums">
                                                {formatNumber(processedFiles)} {t('scans.filesCount')}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                                            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t('scans.postScanErrors')}</div>
                                            <div className={`text-lg font-semibold tabular-nums ${failedFiles > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                {formatNumber(failedFiles)}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                                            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t('scans.postScanDuration')}</div>
                                            <div className="text-lg font-semibold tabular-nums">
                                                {formatDuration('', undefined, progress.elapsed_seconds || 0)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{t('scans.postScanTopTypes')}</div>
                                        {topTypes.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {topTypes.map(([type, count]) => {
                                                    const ratio = totalTypeCount > 0 ? Math.round((count / totalTypeCount) * 100) : 0
                                                    return (
                                                        <Badge key={type} variant="secondary" className="font-normal">
                                                            {getTypeLabel(type)} • {formatNumber(count)} ({ratio}%)
                                                        </Badge>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">{t('scans.postScanNoTypes')}</p>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button size="sm" className="gap-1.5" onClick={() => navigate('/cockpit')}>
                                            <Database className="h-3.5 w-3.5" />
                                            {t('scans.openCockpit')}
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/gallery')}>
                                            <Image className="h-3.5 w-3.5" />
                                            {t('nav.gallery')}
                                        </Button>
                                        {canExportFromSummary ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="gap-1.5"
                                                onClick={handleExportFromSummary}
                                                disabled={isExportingSummary}
                                            >
                                                {isExportingSummary ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <FileDown className="h-3.5 w-3.5" />
                                                )}
                                                {isExportingSummary ? t('scans.postScanExporting') : t('scans.postScanExport')}
                                            </Button>
                                        ) : (
                                            <Button variant="outline" size="sm" className="gap-1.5" onClick={openSearchFallback}>
                                                <FolderSearch className="h-3.5 w-3.5" />
                                                {t('scans.postScanFallbackSearch')}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* SECTION 2: New Scan */}
                {!activeScanId && (
                    <Card className="mb-6">
                        <CardHeader className="pb-4">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Plus className="h-5 w-5" />
                                {t('scans.newScan')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    {isLoadingProjects ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground h-10">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            {t('scans.loading')}
                                        </div>
                                    ) : (
                                        <Select value={contextProject?.name} onValueChange={handleProjectChange}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('scans.selectProject')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {projects.map((project) => (
                                                    <SelectItem key={project.name} value={project.name}>
                                                        <span className="flex items-center gap-2">
                                                            <FolderSearch className="h-4 w-4" />
                                                            {project.name}
                                                            <span className="text-xs text-muted-foreground">
                                                                ({formatEstimatedNumber(project.file_count, project.file_count_estimated)} {t('scans.filesCount')})
                                                            </span>
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>

                                <Button
                                    size="lg"
                                    onClick={handleStartScan}
                                    disabled={!contextProject || isStarting || isEstimating}
                                    className="self-end"
                                >
                                    {isStarting ? (
                                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('scans.starting')}</>
                                    ) : (
                                        <><FolderSearch className="h-4 w-4 mr-2" />{t('scans.startScan')}</>
                                    )}
                                </Button>
                            </div>

                            <ScanConfigPanel
                                projectName={contextProject?.name}
                                projectPath={contextProject?.path}
                                estimate={estimate}
                                isEstimating={isEstimating}
                                enableEmbeddings={enableEmbeddings}
                                onEnableEmbeddingsChange={setEnableEmbeddings}
                            />
                        </CardContent>
                    </Card>
                )}

                {/* SECTION 3: History */}
                <Card>
                    <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Clock className="h-5 w-5" />
                                {t('scans.history')}
                            </CardTitle>
                            <Badge variant="secondary">{scans.length} scans</Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-1">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <ScanRowSkeleton key={i} />
                                ))}
                            </div>
                        ) : scans.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                {t('scans.noScans')}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {scans.map(scan => (
                                    <div
                                        key={scan.id}
                                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <div className="flex-shrink-0">
                                                {scan.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                                                {scan.status === 'running' && <Loader2 className="h-5 w-5 text-primary animate-spin" />}
                                                {scan.status === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
                                                {scan.status === 'cancelled' && <XCircle className="h-5 w-5 text-orange-500" />}
                                                {scan.status === 'pending' && <Clock className="h-5 w-5 text-muted-foreground" />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-medium truncate">{scan.label || scan.path.split('/').pop()}</div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-2">
                                                    <span>{new Date(scan.started_at || scan.created_at).toLocaleString(undefined, { 
                                                        day: '2-digit', 
                                                        month: '2-digit', 
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}</span>
                                                    <span>•</span>
                                                    <span>{formatNumber(scan.total_files)} {t('scans.filesCount')}</span>
                                                    {scan.completed_at && scan.started_at && (
                                                        <>
                                                            <span>•</span>
                                                            <span>{formatDuration(scan.started_at, scan.completed_at)}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(scan.status)}
                                            
                                            {(scan.status === 'failed' || scan.status === 'cancelled') && (
                                                <Button variant="ghost" size="sm" onClick={() => handleResumeScan(scan.id)}>
                                                    <Play className="h-4 w-4" />
                                                </Button>
                                            )}
                                            {scan.status === 'running' && (
                                                <Button variant="ghost" size="sm" onClick={() => handleCancelScan(scan.id)} className="text-orange-500">
                                                    <Square className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="sm" onClick={() => { setSelectedScanId(scan.id); setShowScanDetail(true) }}>
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => openRenameDialog(scan)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => setScanToDelete(scan.id)} className="text-red-500">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
            
            <ScanDetailModal
                scanId={selectedScanId}
                open={showScanDetail}
                onClose={() => setShowScanDetail(false)}
            />

            <AlertDialog
                open={scanToRename !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setScanToRename(null)
                        setRenameValue('')
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('dashboard.renameScanTitle')}</AlertDialogTitle>
                    </AlertDialogHeader>
                    <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        placeholder={t('dashboard.renameScanPlaceholder')}
                        className="my-2"
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRenameScan}>
                            {t('common.save')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            
            <AlertDialog open={scanToDelete !== null} onOpenChange={(open) => !open && setScanToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('scans.deleteTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('scans.deleteDesc')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('scans.deleteCancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => scanToDelete && handleDeleteScan(scanToDelete)}
                            className="bg-red-500 hover:bg-red-600"
                        >
                            {t('scans.deleteConfirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
