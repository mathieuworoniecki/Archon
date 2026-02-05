import { useState } from 'react'
import { FolderSearch, Settings, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from '@/components/ui/dialog'
import { useScanProgress } from '@/hooks/useScanProgress'
import { createScan, getScans, Scan } from '@/lib/api'

interface ScanModalProps {
    onScanComplete?: () => void
}

export function ScanModal({ onScanComplete }: ScanModalProps) {
    const [open, setOpen] = useState(false)
    const [path, setPath] = useState('/documents')
    const [activeScanId, setActiveScanId] = useState<number | null>(null)
    const [scans, setScans] = useState<Scan[]>([])
    const [isStarting, setIsStarting] = useState(false)

    const { progress, isComplete } = useScanProgress(activeScanId)

    const handleStartScan = async () => {
        if (!path.trim()) return

        setIsStarting(true)
        try {
            const scan = await createScan(path)
            setActiveScanId(scan.id)
        } catch (err) {
            console.error('Failed to start scan:', err)
        } finally {
            setIsStarting(false)
        }
    }

    const handleOpenChange = async (isOpen: boolean) => {
        setOpen(isOpen)
        if (isOpen) {
            try {
                const scanList = await getScans()
                setScans(scanList.slice(0, 5))
            } catch (err) {
                console.error('Failed to fetch scans:', err)
            }
        } else if (isComplete) {
            setActiveScanId(null)
            setPath('')
            onScanComplete?.()
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'completed':
                return <Badge variant="success">Terminé</Badge>
            case 'running':
                return <Badge variant="default" className="animate-pulse">En cours</Badge>
            case 'failed':
                return <Badge variant="destructive">Échoué</Badge>
            case 'cancelled':
                return <Badge variant="secondary">Annulé</Badge>
            default:
                return <Badge variant="outline">En attente</Badge>
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <FolderSearch className="h-4 w-4" />
                    Scanner
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Gestion des Scans
                    </DialogTitle>
                    <DialogDescription>
                        Scannez un dossier pour indexer les documents
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* New Scan */}
                    <div className="space-y-3">
                        <label className="text-sm font-medium">Nouveau scan</label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Chemin du dossier (ex: /documents/leaks)"
                                value={path}
                                onChange={(e) => setPath(e.target.value)}
                                disabled={!!activeScanId}
                            />
                            <Button
                                onClick={handleStartScan}
                                disabled={!path.trim() || !!activeScanId || isStarting}
                            >
                                {isStarting ? 'Démarrage...' : 'Lancer'}
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            📄 PDF • 🖼️ Images (JPG, PNG, TIFF) • 📝 Texte (TXT, MD, JSON)
                        </p>
                    </div>

                    {/* Active Scan Progress */}
                    {activeScanId && progress && (
                        <div className="rounded-lg border bg-card p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Scan en cours</span>
                                {getStatusBadge(progress.status)}
                            </div>

                            <Progress value={progress.progress_percent} className="h-2" />

                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{progress.processed_files} / {progress.total_files} fichiers</span>
                                <span>{progress.progress_percent.toFixed(1)}%</span>
                            </div>

                            {progress.current_file && (
                                <div className="text-xs text-muted-foreground truncate">
                                    📄 {progress.current_file}
                                </div>
                            )}

                            {progress.failed_files > 0 && (
                                <div className="flex items-center gap-2 text-xs text-destructive">
                                    <AlertCircle className="h-3 w-3" />
                                    {progress.failed_files} erreur(s)
                                </div>
                            )}

                            {isComplete && (
                                <div className="flex items-center gap-2 text-sm text-green-500">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Scan terminé !
                                </div>
                            )}
                        </div>
                    )}

                    {/* Recent Scans */}
                    {scans.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Scans récents</label>
                            <ScrollArea className="h-[150px]">
                                <div className="space-y-2">
                                    {scans.map((scan) => (
                                        <div
                                            key={scan.id}
                                            className="flex items-center justify-between rounded-md border p-2 text-sm"
                                        >
                                            <div className="flex-1 truncate mr-2">
                                                <span className="text-muted-foreground">#{scan.id}</span>{' '}
                                                {scan.path}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">
                                                    {scan.processed_files}/{scan.total_files}
                                                </span>
                                                {getStatusBadge(scan.status)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
