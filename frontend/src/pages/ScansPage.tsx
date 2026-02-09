import { useState, useEffect } from 'react'
import { 
    Scan, FolderSearch, CheckCircle2, XCircle, Clock, RefreshCw, 
    FileText, Image, Play, Database, Video, Zap, Loader2, 
    Eye, Square, Trash2, ChevronDown, Plus, Pencil
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
// Progress component no longer needed in hero card (custom bars used)
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useScanProgress } from '@/hooks/useScanProgress'
import { createScan, estimateScan, ScanEstimate, type ScanRecord } from '@/lib/api'
import { ScanDetailModal } from '@/components/scan/ScanDetailModal'
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
import { useTranslation } from '@/contexts/I18nContext'
import { useProject } from '@/contexts/ProjectContext'

interface Project {
    name: string
    path: string
    file_count: number
    total_size_bytes: number
}



export function ScansPage() {
    const [scans, setScans] = useState<ScanRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const { t } = useTranslation()
    const { selectedProject: contextProject } = useProject()
    
    // New scan
    const [path, setPath] = useState('/documents')
    const [activeScanId, setActiveScanId] = useState<number | null>(null)
    const [isStarting, setIsStarting] = useState(false)
    
    // Options
    const [enableEmbeddings, setEnableEmbeddings] = useState(false)
    const [embeddingTier, setEmbeddingTier] = useState<'free' | 'paid'>('free')
    const [enableOcr, setEnableOcr] = useState(true)
    const [showOptions, setShowOptions] = useState(false)
    const [scanTypes, setScanTypes] = useState({
        pdf: true,
        image: true,
        text: true,
        video: true
    })
    
    // Estimation & Projects
    const [estimate, setEstimate] = useState<ScanEstimate | null>(null)
    const [isEstimating, setIsEstimating] = useState(false)
    const [projects, setProjects] = useState<Project[]>([])
    const [selectedProject, setSelectedProject] = useState<string>('')
    const [isLoadingProjects, setIsLoadingProjects] = useState(true)
    
    // Modals
    const [selectedScanId, setSelectedScanId] = useState<number | null>(null)
    const [showScanDetail, setShowScanDetail] = useState(false)
    const [scanToDelete, setScanToDelete] = useState<number | null>(null)

    const { progress, isComplete } = useScanProgress(activeScanId)

    useEffect(() => {
        fetchScans()
        fetchProjects()
    }, [])

    const fetchProjects = async () => {
        setIsLoadingProjects(true)
        try {
            const response = await fetch('/api/projects/')
            if (response.ok) {
                const data = await response.json()
                const projectsList = data.projects || data
                setProjects(Array.isArray(projectsList) ? projectsList : [])
                // Auto-select current project from context
                if (contextProject && !selectedProject) {
                    const match = (Array.isArray(projectsList) ? projectsList : []).find(
                        (p: Project) => p.name === contextProject.name
                    )
                    if (match) {
                        handleProjectChange(match.name)
                    }
                }
            }
        } catch (err) {
            console.error('Failed to fetch projects:', err)
        } finally {
            setIsLoadingProjects(false)
        }
    }

    const handleProjectChange = async (projectName: string) => {
        setSelectedProject(projectName)
        const project = projects.find(p => p.name === projectName)
        if (project) {
            setPath(project.path)
            setIsEstimating(true)
            try {
                const est = await estimateScan(project.path)
                setEstimate(est)
            } catch (err) {
                console.error('Estimation failed:', err)
            } finally {
                setIsEstimating(false)
            }
        }
    }

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
            setIsLoading(false)
        }
    }

    const handleStartScan = async () => {
        if (!path.trim()) return
        setIsStarting(true)
        try {
            const scan = await createScan(path, enableEmbeddings)
            setActiveScanId(scan.id)
            fetchScans()
        } catch (err) {
            console.error('Failed to start scan:', err)
        } finally {
            setIsStarting(false)
        }
    }

    const handleCancelScan = async (scanId: number) => {
        try {
            await fetch(`/api/scan/${scanId}/cancel`, { method: 'POST' })
            fetchScans()
            if (scanId === activeScanId) setActiveScanId(null)
        } catch (err) {
            console.error('Failed to cancel:', err)
        }
    }

    const handleResumeScan = async (scanId: number) => {
        try {
            await fetch(`/api/scan/${scanId}/resume`, { method: 'POST' })
            fetchScans()
        } catch (err) {
            console.error('Failed to resume:', err)
        }
    }

    const handleDeleteScan = async (scanId: number) => {
        try {
            await fetch(`/api/scan/${scanId}`, { method: 'DELETE' })
            fetchScans()
        } finally {
            setScanToDelete(null)
        }
    }

    const handleRenameScan = async (scanId: number, currentLabel: string) => {
        const newLabel = window.prompt(t('scans.renamePrompt'), currentLabel)
        if (newLabel === null) return
        try {
            await fetch(`/api/scan/${scanId}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: newLabel })
            })
            fetchScans()
        } catch (err) {
            console.error('Failed to rename:', err)
        }
    }

    const formatNumber = (n: number) => n.toLocaleString()

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
                    <Button onClick={() => fetchScans()} variant="ghost" size="sm">
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
                                        <p className="text-sm text-muted-foreground font-mono">{path}</p>
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
                                <div className="mt-4 flex items-center gap-2 text-green-500 bg-green-500/10 rounded-lg p-3 border border-green-500/20">
                                    <CheckCircle2 className="h-5 w-5" />
                                    <span className="font-medium">{t('scans.scanComplete')}</span>
                                    <span className="text-sm text-muted-foreground ml-auto">
                                        {formatNumber(progress.processed_files)} {t('scans.filesCount')} • {formatDuration('', undefined, progress.elapsed_seconds || 0)}
                                    </span>
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
                            {/* Project Selector */}
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <Label className="mb-2 block">{t('scans.projectToScan')}</Label>
                                    {isLoadingProjects ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground h-10">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            {t('scans.loading')}
                                        </div>
                                    ) : (
                                        <Select value={selectedProject} onValueChange={handleProjectChange}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('scans.selectProject')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {projects.map(project => (
                                                    <SelectItem key={project.name} value={project.name}>
                                                        <span className="flex items-center gap-2">
                                                            <FolderSearch className="h-4 w-4" />
                                                            {project.name}
                                                            <span className="text-xs text-muted-foreground">
                                                                ({formatNumber(project.file_count)} {t('scans.filesCount')})
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
                                    disabled={!selectedProject || isStarting || isEstimating}
                                    className="self-end"
                                >
                                    {isStarting ? (
                                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('scans.starting')}</>
                                    ) : (
                                        <><FolderSearch className="h-4 w-4 mr-2" />{t('scans.startScan')}</>
                                    )}
                                </Button>
                            </div>
                            
                            {/* Estimation */}
                            {isEstimating && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t('scans.estimating')}
                                </div>
                            )}
                            
                            {estimate && !isEstimating && (
                                <div className="space-y-4">
                                    {/* File counts */}
                                    <div className="grid grid-cols-5 gap-3 p-4 rounded-lg bg-muted/50">
                                        <div className="text-center">
                                            <div className="text-xl font-semibold">{formatNumber(estimate.file_count)}</div>
                                            <div className="text-xs text-muted-foreground">{t('scans.total')}</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xl font-semibold flex items-center justify-center gap-1">
                                                <FileText className="h-4 w-4 text-red-500" />
                                                {formatNumber(estimate.type_counts?.pdf || 0)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">PDF</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xl font-semibold flex items-center justify-center gap-1">
                                                <Image className="h-4 w-4 text-blue-500" />
                                                {formatNumber(estimate.type_counts?.image || 0)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">{t('scans.images')}</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xl font-semibold flex items-center justify-center gap-1">
                                                <FileText className="h-4 w-4 text-green-500" />
                                                {formatNumber(estimate.type_counts?.text || 0)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">{t('scans.text')}</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xl font-semibold flex items-center justify-center gap-1">
                                                <Video className="h-4 w-4 text-purple-500" />
                                                {formatNumber(estimate.type_counts?.video || 0)}
                                            </div>
                                            <div className="text-xs text-muted-foreground">{t('scans.videos')}</div>
                                        </div>
                                    </div>
                                    
                                    {/* Size and cost */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 rounded-lg border bg-card">
                                            <div className="text-sm text-muted-foreground">{t('scans.totalSize')}</div>
                                            <div className="text-lg font-semibold">
                                                {estimate.size_mb >= 1000 
                                                    ? `${(estimate.size_mb / 1024).toFixed(1)} Go`
                                                    : `${estimate.size_mb?.toFixed(1)} Mo`
                                                }
                                            </div>
                                        </div>
                                        {estimate.embedding_estimate && (
                                            <div className="p-3 rounded-lg border bg-card">
                                                <div className="text-sm text-muted-foreground">{t('scans.embeddingsCost')}</div>
                                                <div className="text-lg font-semibold flex items-center gap-2">
                                                    <span className={estimate.embedding_estimate.free_tier_available ? 'text-green-500' : 'text-orange-500'}>
                                                        {estimate.embedding_estimate.free_tier_available 
                                                            ? t('scans.free')
                                                            : `$${estimate.embedding_estimate.estimated_cost_usd?.toFixed(2)}`
                                                        }
                                                    </span>
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {formatNumber(estimate.embedding_estimate.estimated_tokens || 0)} {t('scans.tokens')}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {estimate.sampled && (
                                        <div className="text-xs text-muted-foreground text-center">
                                            {t('scans.sampleEstimate')}
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {/* Advanced Options */}
                            <Collapsible open={showOptions} onOpenChange={setShowOptions}>
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="w-full justify-between">
                                        {t('scans.advancedOptions')}
                                        <ChevronDown className={`h-4 w-4 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-4 space-y-4">
                                    {/* File Types */}
                                    <div className="space-y-2">
                                        <Label className="text-sm font-medium">{t('scans.fileTypes')}</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { key: 'pdf', label: 'PDF', icon: FileText, color: 'text-red-500' },
                                                { key: 'image', label: t('scans.images'), icon: Image, color: 'text-blue-500' },
                                                { key: 'text', label: t('scans.text'), icon: FileText, color: 'text-green-500' },
                                                { key: 'video', label: t('scans.videos'), icon: Video, color: 'text-purple-500' },
                                            ].map(({ key, label, icon: Icon, color }) => (
                                                <div key={key} className="flex items-center justify-between p-2 rounded border">
                                                    <span className="flex items-center gap-2 text-sm">
                                                        <Icon className={`h-4 w-4 ${color}`} />
                                                        {label}
                                                    </span>
                                                    <Switch 
                                                        checked={scanTypes[key as keyof typeof scanTypes]} 
                                                        onCheckedChange={(v: boolean) => setScanTypes(prev => ({ ...prev, [key]: v }))}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* OCR */}
                                    <div className="flex items-center justify-between p-3 rounded-lg border">
                                        <div className="flex items-center gap-3">
                                            <FileText className="h-5 w-5 text-blue-500" />
                                            <div>
                                                <div className="font-medium">OCR</div>
                                                <div className="text-xs text-muted-foreground">{t('scans.ocrDesc')}</div>
                                            </div>
                                        </div>
                                        <Switch checked={enableOcr} onCheckedChange={setEnableOcr} />
                                    </div>
                                    
                                    {/* Embeddings */}
                                    <div className="flex items-center justify-between p-3 rounded-lg border">
                                        <div className="flex items-center gap-3">
                                            <Zap className="h-5 w-5 text-purple-500" />
                                            <div>
                                                <div className="font-medium">{t('scans.aiEmbeddings')}</div>
                                                <div className="text-xs text-muted-foreground">{t('scans.semanticSearch')}</div>
                                            </div>
                                        </div>
                                        <Switch checked={enableEmbeddings} onCheckedChange={setEnableEmbeddings} />
                                    </div>
                                    
                                    {enableEmbeddings && (
                                        <div className="ml-8 p-3 rounded-lg border bg-muted/50">
                                            <Label className="text-sm">{t('scans.tier')}</Label>
                                            <div className="flex gap-2 mt-2">
                                                <Button
                                                    variant={embeddingTier === 'free' ? 'default' : 'outline'}
                                                    size="sm"
                                                    onClick={() => setEmbeddingTier('free')}
                                                >
                                                    {t('scans.freeTier')}
                                                </Button>
                                                <Button
                                                    variant={embeddingTier === 'paid' ? 'default' : 'outline'}
                                                    size="sm"
                                                    onClick={() => setEmbeddingTier('paid')}
                                                >
                                                    {t('scans.paidTier')}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </CollapsibleContent>
                            </Collapsible>
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
                            <div className="text-center py-8 text-muted-foreground">
                                <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                                {t('scans.loading')}
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
                                            <Button variant="ghost" size="sm" onClick={() => handleRenameScan(scan.id, scan.label || scan.path.split('/').pop() || '')}>
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
