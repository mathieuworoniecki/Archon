import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
    FileText, Image, FileCode, AlertTriangle, CheckCircle, 
    Clock, Folder, Activity 
} from 'lucide-react'
import { useTranslation } from '@/contexts/I18nContext'
import { authFetch } from '@/lib/auth'

interface ScanDetail {
    id: number
    status: string
    path: string
    total_files: number
    processed_files: number
    failed_files: number
    created_at: string
    completed_at?: string
    errors?: Array<{ file: string; error: string }>
    file_types?: { pdf: number; image: number; text: number }
}

interface ScanDetailModalProps {
    scanId: number | null
    open: boolean
    onClose: () => void
}

export function ScanDetailModal({ scanId, open, onClose }: ScanDetailModalProps) {
    const { t } = useTranslation()
    const [scan, setScan] = useState<ScanDetail | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!scanId || !open) return
        
        setLoading(true)
        authFetch(`/api/scan/${scanId}`)
            .then(res => res.json())
            .then(data => setScan(data))
            .catch(() => setScan(null))
            .finally(() => setLoading(false))
    }, [scanId, open])

    if (!scan && !loading) return null

    const progress = scan ? (scan.processed_files / Math.max(scan.total_files, 1)) * 100 : 0
    
    const statusColor = {
        completed: 'bg-green-500',
        running: 'bg-blue-500',
        failed: 'bg-red-500',
        pending: 'bg-yellow-500',
        cancelled: 'bg-gray-500'
    }[scan?.status || 'pending'] || 'bg-gray-500'

    const formatDuration = () => {
        if (!scan?.created_at) return '-'
        const start = new Date(scan.created_at)
        const end = scan.completed_at ? new Date(scan.completed_at) : new Date()
        const diff = Math.floor((end.getTime() - start.getTime()) / 1000)
        
        if (diff < 60) return `${diff}s`
        if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`
        return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Scan #{scanId}
                        {scan && (
                            <Badge className={`${statusColor} text-white ml-2`}>
                                {scan.status.toUpperCase()}
                            </Badge>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center h-48">
                        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                    </div>
                ) : scan ? (
                    <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="overview">{t('scans.tabOverview')}</TabsTrigger>
                            <TabsTrigger value="files">{t('scans.tabFiles')}</TabsTrigger>
                            <TabsTrigger value="errors">
                                {t('scans.tabErrors')}
                                {scan.failed_files > 0 && (
                                    <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">
                                        {scan.failed_files}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-4 mt-4">
                            {/* Progress */}
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span>{t('scans.progression')}</span>
                                    <span className="font-mono">
                                        {scan.processed_files} / {scan.total_files}
                                    </span>
                                </div>
                                <Progress value={progress} className="h-2" />
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                        <Folder className="h-4 w-4" />
                                        {t('scans.scanPath')}
                                    </div>
                                    <p className="font-mono text-xs truncate" title={scan.path}>
                                        {scan.path}
                                    </p>
                                </div>

                                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                        <Clock className="h-4 w-4" />
                                        {t('scans.scanDuration')}
                                    </div>
                                    <p className="font-bold">{formatDuration()}</p>
                                </div>

                                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                        {t('scans.scanSuccess')}
                                    </div>
                                    <p className="font-bold text-green-500">
                                        {scan.processed_files - scan.failed_files}
                                    </p>
                                </div>

                                <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                        <AlertTriangle className="h-4 w-4 text-red-500" />
                                        {t('scans.scanErrors')}
                                    </div>
                                    <p className="font-bold text-red-500">{scan.failed_files}</p>
                                </div>
                            </div>

                            {/* File Types */}
                            {scan.file_types && (
                                <div className="p-4 rounded-lg bg-muted/50">
                                    <h4 className="text-sm font-medium mb-3">{t('scans.scanFileTypes')}</h4>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-red-400" />
                                            <span className="text-sm">{scan.file_types.pdf} PDF</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Image className="h-4 w-4 text-blue-400" />
                                            <span className="text-sm">{scan.file_types.image} {t('scans.images')}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <FileCode className="h-4 w-4 text-green-400" />
                                            <span className="text-sm">{scan.file_types.text} {t('scans.text')}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Timestamps */}
                            <div className="text-xs text-muted-foreground space-y-1">
                                <p>{t('scans.scanStarted')}: {new Date(scan.created_at).toLocaleString()}</p>
                                {scan.completed_at && (
                                    <p>{t('scans.scanEnded')}: {new Date(scan.completed_at).toLocaleString()}</p>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="files" className="mt-4">
                            <ScrollArea className="h-[300px]">
                                <div className="space-y-1 pr-4">
                                    <p className="text-sm text-muted-foreground mb-2">
                                        {scan.processed_files} {t('scans.scanFilesProcessed')}
                                    </p>
                                    <p className="text-sm text-muted-foreground italic">
                                        {t('scans.scanAuditHint')}
                                    </p>
                                </div>
                            </ScrollArea>
                        </TabsContent>

                        <TabsContent value="errors" className="mt-4">
                            <ScrollArea className="h-[300px]">
                                {scan.failed_files === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                                        <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
                                        <p>{t('scans.scanNoErrors')}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 pr-4">
                                        {scan.errors?.map((err, i) => (
                                            <div key={i} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                                <p className="font-mono text-xs text-red-400 truncate">
                                                    {err.file}
                                                </p>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    {err.error}
                                                </p>
                                            </div>
                                        )) || (
                                            <p className="text-sm text-muted-foreground italic">
                                                {scan.failed_files} {t('scans.scanErrorDetails')}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                ) : null}
            </DialogContent>
        </Dialog>
    )
}
