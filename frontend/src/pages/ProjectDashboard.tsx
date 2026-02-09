/**
 * ProjectDashboard — Landing page.
 * Shows all projects as cards with scan stats. Clicking a project enters the app.
 * Scan launch + active scan progress stay visible here.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Shield, FolderOpen, Scan, FolderSearch, FileText, Database,
    CheckCircle2, XCircle, Clock, Loader2, Square,
    Trash2, Eye, HardDrive, ArrowRight,
    Zap, RefreshCw, Play, MoreVertical, Pencil, AlertTriangle, ChevronDown, SkipForward,
    RotateCcw, Image, FileCode, Video
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ProjectCardSkeleton } from '@/components/ui/skeleton'
import { useProject, type Project as ProjectType } from '@/contexts/ProjectContext'
import { useScanProgress } from '@/hooks/useScanProgress'
import { createScan, estimateScan, factoryReset, type ScanRecord, type ScanEstimate } from '@/lib/api'
import { ScanDetailModal } from '@/components/scan/ScanDetailModal'
import { useTranslation } from '@/contexts/I18nContext'
import { useTheme } from '@/hooks/useTheme'
import { toast } from 'sonner'

export function ProjectDashboard() {
    const { projects, isLoading: isLoadingProjects, documentsPath, selectProject, refetchProjects } = useProject()
    const { t } = useTranslation()
    const { theme, toggleTheme } = useTheme()
    const navigate = useNavigate()

    // Scans
    const [scans, setScans] = useState<ScanRecord[]>([])
    const [isLoadingScans, setIsLoadingScans] = useState(true)
    const [activeScanId, setActiveScanId] = useState<number | null>(null)
    const [isStarting, setIsStarting] = useState(false)

    // Modals
    const [selectedScanId, setSelectedScanId] = useState<number | null>(null)
    const [showScanDetail, setShowScanDetail] = useState(false)
    const [scanToDelete, setScanToDelete] = useState<number | null>(null)

    // Scan config dialog
    const [projectToScan, setProjectToScan] = useState<ProjectType | null>(null)
    const [resumeScanId, setResumeScanId] = useState<number | null>(null)
    const [enableEmbeddings, setEnableEmbeddings] = useState(false)
    const [embeddingTier, setEmbeddingTier] = useState<'free' | 'paid'>('free')

    // Rename project (scan label)
    const [renamingProject, setRenamingProject] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')

    // Delete project (all project scans)
    const [projectToDelete, setProjectToDelete] = useState<ProjectType | null>(null)

    // Resume scan
    const [isResuming] = useState(false)

    // Scan estimate
    const [scanEstimate, setScanEstimate] = useState<ScanEstimate | null>(null)
    const [isEstimating, setIsEstimating] = useState(false)

    // Factory reset
    const [showFactoryReset, setShowFactoryReset] = useState(false)
    const [resetConfirmText, setResetConfirmText] = useState('')
    const [isResetting, setIsResetting] = useState(false)

    const { progress, isComplete, isReconnecting } = useScanProgress(activeScanId)

    // Toast on scan completion
    useEffect(() => {
        if (isComplete && progress) {
            toast.success(`Scan terminé — ${formatNumber(progress.processed_files)} fichiers traités`)
        }
    }, [isComplete])

    useEffect(() => { fetchScans() }, [])

    const fetchScans = async () => {
        try {
            const response = await fetch('/api/scan/')
            if (response.ok) {
                const data = await response.json()
                const scanList = Array.isArray(data) ? data : []
                setScans(scanList)
                const running = scanList.find((s: ScanRecord) => s.status === 'running')
                if (running) setActiveScanId(running.id)
            }
        } catch (err) {
            console.error('Failed to fetch scans:', err)
        } finally {
            setIsLoadingScans(false)
        }
    }

    const openScanDialog = async (project: ProjectType, resumeId?: number) => {
        setProjectToScan(project)
        setResumeScanId(resumeId ?? null)
        setScanEstimate(null)
        // Restore saved options from interrupted scan
        if (resumeId) {
            const scan = scans.find(s => s.id === resumeId)
            setEnableEmbeddings(scan?.enable_embeddings ?? false)
        } else {
            setEnableEmbeddings(false)
        }
        setEmbeddingTier('free')
        // Fetch scan estimate
        setIsEstimating(true)
        try {
            const estimate = await estimateScan(project.path)
            setScanEstimate(estimate)
        } catch {
            // Non-blocking — dialog still works without estimate
        } finally {
            setIsEstimating(false)
        }
    }

    const handleConfirmScan = async () => {
        if (!projectToScan) return
        setIsStarting(true)
        const project = projectToScan
        const scanIdToResume = resumeScanId
        setProjectToScan(null)
        setResumeScanId(null)
        try {
            if (scanIdToResume) {
                const response = await fetch(`/api/scan/${scanIdToResume}/resume`, { method: 'POST' })
                if (response.ok) {
                    const data = await response.json()
                    setActiveScanId(data.id || scanIdToResume)
                    fetchScans()
                    toast.success('Scan repris avec succès')
                }
            } else {
                const scan = await createScan(project.path, enableEmbeddings)
                setActiveScanId(scan.id)
                fetchScans()
                toast.success(`Scan lancé — ${project.name}`)
            }
        } catch (err) {
            console.error('Failed to start scan:', err)
            toast.error('Échec du lancement du scan')
        } finally {
            setIsStarting(false)
        }
    }

    const handleDeleteScan = async (scanId: number) => {
        try {
            await fetch(`/api/scan/${scanId}`, { method: 'DELETE' })
            fetchScans()
            toast.success('Scan supprimé')
        } catch {
            toast.error('Échec de la suppression')
        } finally {
            setScanToDelete(null)
        }
    }

    const handleCancelScan = async (scanId: number) => {
        try {
            await fetch(`/api/scan/${scanId}/cancel`, { method: 'POST' })
            fetchScans()
            if (scanId === activeScanId) setActiveScanId(null)
            toast.success('Scan annulé')
        } catch (err) {
            console.error('Failed to cancel:', err)
            toast.error('Échec de l\'annulation')
        }
    }

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
    }

    const formatNumber = (n: number) => n.toLocaleString()

    const formatDuration = (start: string, end?: string, seconds?: number) => {
        let s: number
        if (seconds !== undefined) {
            s = seconds
        } else {
            const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
            s = Math.floor(ms / 1000)
        }
        if (s < 60) return `${s}s`
        if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
        return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
    }

    // Get scan history for a specific project
    const getProjectScans = (project: ProjectType): ScanRecord[] => {
        return scans.filter(s => s.path === project.path || s.path.includes(`/${project.name}`))
    }

    const getLastScan = (project: ProjectType): ScanRecord | undefined => {
        const pScans = getProjectScans(project)
        return pScans.length > 0 ? pScans[0] : undefined
    }

    // Find the last interrupted scan (failed/cancelled) for a project that can be resumed
    const getInterruptedScan = (project: ProjectType): ScanRecord | undefined => {
        const pScans = getProjectScans(project)
        return pScans.find(s => s.status === 'failed' || s.status === 'cancelled')
    }


    // Delete all scans for a project
    const handleDeleteProject = async (project: ProjectType) => {
        const pScans = getProjectScans(project)
        try {
            for (const scan of pScans) {
                await fetch(`/api/scan/${scan.id}`, { method: 'DELETE' })
            }
            fetchScans()
            refetchProjects()
            toast.success(`Projet ${project.name} supprimé (${pScans.length} scans)`)
        } catch {
            toast.error('Échec de la suppression du projet')
        } finally {
            setProjectToDelete(null)
        }
    }

    // Rename a scan
    const handleRenameScan = async (scanId: number, label: string) => {
        try {
            await fetch(`/api/scan/${scanId}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label })
            })
            fetchScans()
            toast.success('Scan renommé')
        } catch {
            toast.error('Échec du renommage')
        } finally {
            setRenamingProject(null)
        }
    }

    // Factory reset
    const handleFactoryReset = async () => {
        setIsResetting(true)
        try {
            const result = await factoryReset()
            toast.success(`Reset terminé — ${result.deleted_scans} scans, ${result.deleted_documents} documents supprimés`)
            // Clear all scan state
            setActiveScanId(null)
            // Force reload to ensure clean state everywhere
            setTimeout(() => window.location.reload(), 1000)
        } catch {
            toast.error('Échec du factory reset')
        } finally {
            setIsResetting(false)
            setShowFactoryReset(false)
            setResetConfirmText('')
        }
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Sticky header */}
            <header className="sticky top-0 z-40 border-b border-[rgba(255,255,255,0.06)] bg-gradient-to-r from-[rgba(30,41,59,0.4)] to-[rgba(15,23,42,0.5)] backdrop-blur-[16px] hud-scanlines">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)]">
                            <Shield className="h-6 w-6 text-[#F59E0B]" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight hud-text-glow">Archon</h1>
                            <p className="text-xs text-muted-foreground font-data">{t('dashboard.subtitle')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { fetchScans(); refetchProjects(); toast.success('Données rafraîchies') }}>
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowFactoryReset(true)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            title="Factory Reset"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={toggleTheme}>
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Active Scan Hero — Full detail view */}
                {activeScanId && progress && (
                    <Card className="border-primary/50 border-2 mb-8 overflow-hidden">
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
                                        <p className="text-sm text-muted-foreground font-mono">
                                            {formatNumber(progress.processed_files)} / {formatNumber(progress.total_files)} {t('scans.filesCount')}
                                        </p>
                                    </div>
                                </div>
                                {isReconnecting && (
                                    <Badge variant="outline" className="text-yellow-500 border-yellow-500/50 animate-pulse gap-1.5">
                                        <Zap className="h-3 w-3" />
                                        Reconnexion…
                                    </Badge>
                                )}
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
                                <div className="text-center p-3 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
                                    <div className="text-2xl font-bold text-primary tabular-nums">
                                        {formatNumber(progress.processed_files)}
                                        <span className="text-base text-muted-foreground font-normal">/{formatNumber(progress.total_files)}</span>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.processed')}</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
                                    <div className="text-2xl font-bold text-blue-500 tabular-nums">
                                        {progress.files_per_second > 0 ? progress.files_per_second.toFixed(1) : '—'}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.filesPerSec')}</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
                                    <div className="text-2xl font-bold tabular-nums">
                                        {progress.eta_seconds != null ? formatDuration('', undefined, progress.eta_seconds) : '—'}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.eta')}</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
                                    <div className={`text-2xl font-bold tabular-nums ${(progress.failed_files || 0) > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                        {progress.failed_files || 0}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.errors')}</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
                                    <div className="text-2xl font-bold text-muted-foreground tabular-nums">
                                        {progress.skipped_files || 0}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide mt-0.5">{t('scans.skipped')}</div>
                                </div>
                                <div className="text-center p-3 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
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
                                    <div className="p-3 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
                                        <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide font-data">{t('scans.typeBreakdown')}</div>
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
                                <div className="p-3 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
                                    <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide font-data">{t('scans.recentActivity')}</div>
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

                            {/* Diagnostics Accordion */}
                            {(progress.skipped_details?.length > 0 || progress.recent_errors?.length > 0) && (
                                <details className="mt-4 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(22,27,34,0.6)] overflow-hidden group">
                                    <summary className="flex items-center justify-between cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors select-none">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                                            {t('scans.diagnostics')}
                                            <span className="text-xs font-mono text-muted-foreground">
                                                ({(progress.skipped_details?.length || 0)} + {(progress.recent_errors?.length || 0)})
                                            </span>
                                        </div>
                                        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                                    </summary>
                                    <div className="px-4 pb-4 space-y-3 border-t border-[rgba(255,255,255,0.06)]">
                                        {/* Skipped files */}
                                        {progress.skipped_details && progress.skipped_details.length > 0 && (
                                            <div className="pt-3">
                                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                                                    <SkipForward className="h-3 w-3" />
                                                    {t('scans.skippedFiles')} ({progress.skipped_details.length})
                                                </div>
                                                <div className="max-h-32 overflow-y-auto space-y-1 scrollbar-thin">
                                                    {progress.skipped_details.map((item, i) => (
                                                        <div key={`skip-${i}`} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-[rgba(255,255,255,0.03)]">
                                                            <span className="truncate font-mono text-muted-foreground flex-1">{item.file}</span>
                                                            <span className="text-amber-500/70 text-[11px] shrink-0">{item.reason}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {/* Recent errors */}
                                        {progress.recent_errors && progress.recent_errors.length > 0 && (
                                            <div className="pt-2">
                                                <div className="flex items-center gap-2 text-xs font-medium text-red-400 uppercase tracking-wide mb-2">
                                                    <XCircle className="h-3 w-3" />
                                                    {t('scans.recentErrors')} ({progress.recent_errors.length})
                                                </div>
                                                <div className="max-h-32 overflow-y-auto space-y-1 scrollbar-thin">
                                                    {progress.recent_errors.map((err, i) => (
                                                        <div key={`err-${i}`} className="flex items-start gap-2 text-xs py-1.5 px-2 rounded bg-red-500/5 border border-red-500/10">
                                                            <AlertTriangle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                                                            <div className="min-w-0">
                                                                <span className="font-mono text-foreground truncate block">{err.file}</span>
                                                                <span className="text-red-400/70 text-[11px]">[{err.type}] {err.message}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </details>
                            )}

                            {isComplete && (
                                <div className="mt-4 space-y-3">
                                    <div className="flex items-center gap-2 text-green-500 bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                                        <CheckCircle2 className="h-5 w-5" />
                                        <span className="font-medium">{t('scans.scanComplete')}</span>
                                        <span className="text-sm text-muted-foreground ml-auto">
                                            {formatNumber(progress.processed_files)} {t('scans.filesCount')} • {formatDuration('', undefined, progress.elapsed_seconds || 0)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                const proj = projects.find(p => scans.find(s => s.id === activeScanId && s.path === p.path))
                                                if (proj) { selectProject(proj); navigate('/cockpit') }
                                            }}
                                            className="gap-1.5"
                                        >
                                            <Database className="h-3.5 w-3.5" />
                                            Ouvrir le Cockpit
                                            <ArrowRight className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const proj = projects.find(p => scans.find(s => s.id === activeScanId && s.path === p.path))
                                                if (proj) { selectProject(proj); navigate('/gallery') }
                                            }}
                                            className="gap-1.5"
                                        >
                                            <Image className="h-3.5 w-3.5" />
                                            Galerie
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => navigate('/scans')}
                                            className="gap-1.5"
                                        >
                                            <Eye className="h-3.5 w-3.5" />
                                            Voir les Scans
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Projects Grid */}
                <div className="mb-6">
                    <div className="flex items-center gap-3 mb-6">
                        <HardDrive className="h-5 w-5 text-muted-foreground" />
                        <h2 className="text-lg font-semibold">{t('dashboard.projects')}</h2>
                        <Badge variant="secondary">{projects.length}</Badge>
                    </div>

                    {isLoadingProjects ? (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            <ProjectCardSkeleton />
                            <ProjectCardSkeleton />
                            <ProjectCardSkeleton />
                        </div>
                    ) : projects.length === 0 ? (
                        <Card className="p-12 text-center">
                            <FolderOpen className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                            <h3 className="text-lg font-medium mb-1">{t('dashboard.noProjects')}</h3>
                            <p className="text-sm text-muted-foreground">
                                {t('dashboard.createProject')} <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{documentsPath}</code>
                            </p>
                        </Card>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {projects.map(project => {
                                const lastScan = getLastScan(project)
                                const projectScans = getProjectScans(project)
                                const hasCompletedScan = projectScans.some(s => s.status === 'completed')

                                return (
                                    <Card key={project.name}
                                          className="group relative overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
                                        <CardContent className="p-6">
                                            {/* Project header */}
                                            <div className="flex items-start justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 rounded-xl bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.15)] group-hover:bg-[rgba(245,158,11,0.2)] transition-colors">
                                                        <FolderOpen className="h-6 w-6 text-[#F59E0B]" />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-semibold text-lg">{project.name}</h3>
                                                        <p className="text-xs text-muted-foreground">{formatBytes(project.total_size_bytes)}</p>
                                                    </div>
                                                </div>
                                                {hasCompletedScan && (
                                                    <Badge variant="default" className="bg-green-500/15 text-green-500 border-green-500/20">
                                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                                        {t('dashboard.scanned')}
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* File stats */}
                                            <div className="grid grid-cols-3 gap-2 mb-4">
                                                <div className="text-center p-2 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
                                                    <div className="text-lg font-bold">{formatNumber(project.file_count)}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase">{t('scans.filesCount')}</div>
                                                </div>
                                                <div className="text-center p-2 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
                                                    <div className="text-lg font-bold">{project.subdirectories}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase">{t('dashboard.folders')}</div>
                                                </div>
                                                <div className="text-center p-2 rounded-lg bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.06)]">
                                                    <div className="text-lg font-bold">{projectScans.length}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase">{t('dashboard.scansCount')}</div>
                                                </div>
                                            </div>

                                            {/* Last scan info */}
                                            {lastScan && (
                                                <div className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5">
                                                    <Clock className="h-3 w-3" />
                                                    {t('dashboard.lastScan')}: {new Date(lastScan.started_at || lastScan.created_at).toLocaleDateString()}
                                                    {lastScan.status === 'completed' && (
                                                        <span className="text-green-500 ml-1">✓ {formatNumber(lastScan.total_files)} {t('scans.filesCount')}</span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Actions */}
                                            <div className="space-y-2">
                                                {/* Resume interrupted scan button */}
                                                {(() => {
                                                    const interrupted = getInterruptedScan(project)
                                                    if (!interrupted) return null
                                                    const pct = interrupted.total_files > 0
                                                        ? Math.round((interrupted.processed_files / interrupted.total_files) * 100)
                                                        : 0
                                                    return (
                                                        <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                                                            <div className="flex items-center gap-2 text-xs text-orange-400 mb-1.5">
                                                                <AlertTriangle className="h-3 w-3" />
                                                                <span>{t('dashboard.scanInterrupted')}</span>
                                                                <span className="ml-auto font-medium">{pct}%</span>
                                                            </div>
                                                            <div className="w-full h-1.5 bg-orange-500/20 rounded-full mb-2">
                                                                <div className="h-full bg-orange-500 rounded-full transition-all"
                                                                     style={{ width: `${pct}%` }} />
                                                            </div>
                                                            <Button size="sm" variant="outline" className="w-full border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                                                                    onClick={() => openScanDialog(project, interrupted.id)}
                                                                    disabled={isResuming}>
                                                                {isResuming ? (
                                                                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                                                ) : (
                                                                    <Play className="h-3.5 w-3.5 mr-1.5" />
                                                                )}
                                                                {t('dashboard.continueScan')}
                                                            </Button>
                                                        </div>
                                                    )
                                                })()}

                                                <div className="flex gap-2">
                                                    <Button className="flex-1" onClick={() => { selectProject(project); navigate('/') }}>
                                                        {t('dashboard.openProject')}
                                                        <ArrowRight className="h-4 w-4 ml-2" />
                                                    </Button>
                                                    <Button variant="outline" size="icon" onClick={() => openScanDialog(project)}
                                                            disabled={isStarting} title={hasCompletedScan ? t('dashboard.rescan') : t('dashboard.startScan')}>
                                                        {isStarting ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Scan className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            {lastScan && (
                                                                <DropdownMenuItem onClick={() => {
                                                                    setRenamingProject(project.name)
                                                                    setRenameValue(lastScan.label || project.name)
                                                                }}>
                                                                    <Pencil className="h-4 w-4 mr-2" />
                                                                    {t('dashboard.renameScan')}
                                                                </DropdownMenuItem>
                                                            )}
                                                            {lastScan && (
                                                                <DropdownMenuItem onClick={() => {
                                                                    setSelectedScanId(lastScan.id)
                                                                    setShowScanDetail(true)
                                                                }}>
                                                                    <Eye className="h-4 w-4 mr-2" />
                                                                    {t('dashboard.viewLastScan')}
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-red-500 focus:text-red-500"
                                                                              onClick={() => setProjectToDelete(project)}>
                                                                <Trash2 className="h-4 w-4 mr-2" />
                                                                {t('dashboard.deleteProject')}
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Scan History */}
                {!isLoadingScans && scans.length > 0 && (
                    <div className="mt-10">
                        <div className="flex items-center gap-3 mb-4">
                            <Clock className="h-5 w-5 text-muted-foreground" />
                            <h2 className="text-lg font-semibold">{t('scans.history')}</h2>
                            <Badge variant="secondary">{scans.length}</Badge>
                        </div>
                        <Card>
                            <CardContent className="p-0">
                                <div className="divide-y">
                                    {scans.map(scan => (
                                        <div key={scan.id}
                                             className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/30 transition-colors">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                <div className="flex-shrink-0">
                                                    {scan.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                                                    {scan.status === 'running' && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                                                    {scan.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" />}
                                                    {scan.status === 'cancelled' && <XCircle className="h-4 w-4 text-orange-500" />}
                                                    {scan.status === 'pending' && <Clock className="h-4 w-4 text-muted-foreground" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-medium text-sm truncate">{scan.label || scan.path.split('/').pop()}</div>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                                                        <span>{new Date(scan.started_at || scan.created_at).toLocaleString(undefined, {
                                                            day: '2-digit', month: '2-digit', year: 'numeric',
                                                            hour: '2-digit', minute: '2-digit'
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
                                            <div className="flex items-center gap-1.5">
                                                <Badge variant={
                                                    scan.status === 'completed' ? 'default' :
                                                    scan.status === 'failed' ? 'destructive' : 'secondary'
                                                } className="text-xs">
                                                    {t(`scans.${scan.status}`)}
                                                </Badge>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                                                        onClick={() => { setSelectedScanId(scan.id); setShowScanDetail(true) }}>
                                                    <Eye className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500"
                                                        onClick={() => setScanToDelete(scan.id)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </main>

            {/* Modals */}
            <ScanDetailModal scanId={selectedScanId} open={showScanDetail} onClose={() => setShowScanDetail(false)} />

            {/* Delete scan confirmation — enriched with context */}
            <AlertDialog open={scanToDelete !== null} onOpenChange={(open) => !open && setScanToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Trash2 className="h-5 w-5 text-red-500" />
                            {t('scans.deleteTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {(() => {
                                const scan = scans.find(s => s.id === scanToDelete)
                                return scan ? (
                                    <span>
                                        Supprimer le scan <strong>#{scan.id}</strong> ?
                                        <br />
                                        <span className="text-xs text-muted-foreground mt-1 block">
                                            {formatNumber(scan.total_files)} fichiers indexés seront supprimés.
                                        </span>
                                    </span>
                                ) : t('scans.deleteDesc')
                            })()}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('scans.deleteCancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => scanToDelete && handleDeleteScan(scanToDelete)}
                                           className="bg-red-500 hover:bg-red-600">
                            {t('scans.deleteConfirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete project confirmation — enriched */}
            <AlertDialog open={projectToDelete !== null} onOpenChange={(open) => !open && setProjectToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Trash2 className="h-5 w-5 text-red-500" />
                            {t('dashboard.deleteProjectTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Supprimer le projet <strong>{projectToDelete?.name}</strong> ?
                            {projectToDelete && (
                                <span className="text-xs text-muted-foreground mt-1 block">
                                    {getProjectScans(projectToDelete).length} scan(s) et tous les documents associés seront supprimés.
                                </span>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => projectToDelete && handleDeleteProject(projectToDelete)}
                                           className="bg-red-500 hover:bg-red-600">
                            {t('common.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Rename scan dialog */}
            <AlertDialog open={renamingProject !== null} onOpenChange={(open) => !open && setRenamingProject(null)}>
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
                        <AlertDialogAction onClick={() => {
                            if (renamingProject) {
                                const project = projects.find(p => p.name === renamingProject)
                                if (project) {
                                    const scan = getLastScan(project)
                                    if (scan) handleRenameScan(scan.id, renameValue)
                                }
                            }
                        }}>
                            {t('common.save')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Scan configuration dialog */}
            <AlertDialog open={projectToScan !== null} onOpenChange={(open) => !open && setProjectToScan(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Scan className="h-5 w-5" />
                            {resumeScanId ? t('scans.resumeScan') : t('scans.newScan')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {projectToScan?.name} — {projectToScan?.path}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Scan Estimate Preview */}
                        {!resumeScanId && (
                            <div className="p-3 rounded-lg border bg-muted/30">
                                {isEstimating ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Analyse du dossier…
                                    </div>
                                ) : scanEstimate ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <FolderSearch className="h-4 w-4 text-primary" />
                                            {formatNumber(scanEstimate.file_count)} fichiers détectés
                                            {scanEstimate.sampled && <Badge variant="outline" className="text-[10px] py-0">estimé</Badge>}
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                            {scanEstimate.type_counts.pdf > 0 && (
                                                <span className="flex items-center gap-1"><FileText className="h-3 w-3 text-red-400" />{formatNumber(scanEstimate.type_counts.pdf)} PDF</span>
                                            )}
                                            {scanEstimate.type_counts.image > 0 && (
                                                <span className="flex items-center gap-1"><Image className="h-3 w-3 text-blue-400" />{formatNumber(scanEstimate.type_counts.image)} Images</span>
                                            )}
                                            {scanEstimate.type_counts.text > 0 && (
                                                <span className="flex items-center gap-1"><FileCode className="h-3 w-3 text-green-400" />{formatNumber(scanEstimate.type_counts.text)} Textes</span>
                                            )}
                                            {scanEstimate.type_counts.video > 0 && (
                                                <span className="flex items-center gap-1"><Video className="h-3 w-3 text-purple-400" />{formatNumber(scanEstimate.type_counts.video)} Vidéos</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            💾 {scanEstimate.size_mb.toFixed(1)} MB
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}

                        {/* AI Embeddings toggle */}
                        <div className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <Zap className={`h-5 w-5 ${enableEmbeddings ? 'text-purple-500' : 'text-muted-foreground'}`} />
                                <div>
                                    <Label className="font-medium">{t('scans.aiEmbeddings')}</Label>
                                    <div className="text-xs text-muted-foreground">{t('scans.semanticSearch')}</div>
                                </div>
                            </div>
                            <Switch checked={enableEmbeddings} onCheckedChange={setEnableEmbeddings} />
                        </div>

                        {/* Embedding cost preview */}
                        {enableEmbeddings && scanEstimate && (
                            <div className="p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
                                <div className="text-xs text-purple-300">
                                    🧠 Coût estimé : <strong>${scanEstimate.embedding_estimate.estimated_cost_usd.toFixed(3)}</strong>
                                    {scanEstimate.embedding_estimate.free_tier_available && (
                                        <Badge className="ml-2 bg-green-500/20 text-green-400 text-[10px] py-0">Free tier ✓</Badge>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Tier selection */}
                        {enableEmbeddings && (
                            <div className="flex items-center justify-between p-3 rounded-lg border">
                                <div className="flex items-center gap-3">
                                    <Database className={`h-5 w-5 ${embeddingTier === 'paid' ? 'text-amber-500' : 'text-muted-foreground'}`} />
                                    <div>
                                        <Label className="font-medium">{t('scans.tier')}</Label>
                                        <div className="text-xs text-muted-foreground">
                                            {embeddingTier === 'free' ? t('scans.freeTierDesc') : t('scans.paidTierDesc')}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex rounded-md border overflow-hidden">
                                    <button
                                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                            embeddingTier === 'free'
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-transparent text-muted-foreground hover:text-foreground'
                                        }`}
                                        onClick={() => setEmbeddingTier('free')}
                                    >
                                        {t('scans.freeTier')}
                                    </button>
                                    <button
                                        className={`px-3 py-1.5 text-xs font-medium transition-colors border-l ${
                                            embeddingTier === 'paid'
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-transparent text-muted-foreground hover:text-foreground'
                                        }`}
                                        onClick={() => setEmbeddingTier('paid')}
                                    >
                                        {t('scans.paidTier')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmScan}>
                            {resumeScanId ? (
                                <Play className="h-4 w-4 mr-2" />
                            ) : (
                                <FolderSearch className="h-4 w-4 mr-2" />
                            )}
                            {resumeScanId ? t('dashboard.continueScan') : t('scans.startScan')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {/* Factory Reset Confirmation */}
            <AlertDialog open={showFactoryReset} onOpenChange={(open) => { if (!open) { setShowFactoryReset(false); setResetConfirmText('') } }}>
                <AlertDialogContent className="border-red-500/30">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-red-500">
                            <RotateCcw className="h-5 w-5" />
                            Factory Reset
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <span className="block mb-3">
                                Cette action est <strong className="text-red-400">irréversible</strong>. Toutes les données seront supprimées :
                            </span>
                            <ul className="text-xs space-y-1 text-muted-foreground mb-4">
                                <li>• Tous les scans et leur historique</li>
                                <li>• Tous les documents indexés</li>
                                <li>• Tous les favoris et tags</li>
                                <li>• Les index MeiliSearch et Qdrant</li>
                            </ul>
                            <span className="block text-xs">Tapez <strong className="text-red-400 font-mono">RESET</strong> pour confirmer :</span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                        value={resetConfirmText}
                        onChange={(e) => setResetConfirmText(e.target.value)}
                        placeholder="RESET"
                        className="font-mono text-center border-red-500/30 focus:border-red-500"
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleFactoryReset}
                            disabled={resetConfirmText !== 'RESET' || isResetting}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-30"
                        >
                            {isResetting ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Réinitialisation…</>
                            ) : (
                                <><RotateCcw className="h-4 w-4 mr-2" /> Réinitialiser</>
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
