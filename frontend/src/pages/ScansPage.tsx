import { useState, useEffect } from 'react'
import { 
    Scan, FolderSearch, CheckCircle2, XCircle, Clock, RefreshCw, 
    FileText, Image, Play, Settings, Database, Video,
    DollarSign, Zap, AlertCircle, Loader2, Info, AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useScanProgress } from '@/hooks/useScanProgress'
import { createScan, estimateScan, ScanEstimate } from '@/lib/api'


interface ScanRecord {
    id: number
    path: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    total_files: number
    processed_files: number
    error_count: number
    started_at: string
    completed_at?: string
    documents_by_type?: {
        pdf: number
        image: number
        text: number
    }
}

export function ScansPage() {
    const [scans, setScans] = useState<ScanRecord[]>([])
    const [isLoading, setIsLoading] = useState(true)
    
    // Scan configuration state
    const [path, setPath] = useState('/documents')
    const [activeScanId, setActiveScanId] = useState<number | null>(null)
    const [isStarting, setIsStarting] = useState(false)
    const [showCostConfirm, setShowCostConfirm] = useState(false)
    
    // Scan options
    const [enableEmbeddings, setEnableEmbeddings] = useState(false)
    const [embeddingTier, setEmbeddingTier] = useState<'free' | 'paid'>('free')
    const [enableOcr, setEnableOcr] = useState(true)
    const [enableVideoOcr, setEnableVideoOcr] = useState(true)
    const [scanTypes, setScanTypes] = useState({
        pdf: true,
        image: true,
        text: true,
        video: true
    })
    
    // Estimation
    const [estimate, setEstimate] = useState<ScanEstimate | null>(null)
    const [isEstimating, setIsEstimating] = useState(false)
    const [estimateError, setEstimateError] = useState<string | null>(null)

    const { progress, isComplete } = useScanProgress(activeScanId)

    // Fetch scans on mount
    useEffect(() => {
        fetchScans()
    }, [])
    
    // Fetch estimate when path changes
    useEffect(() => {
        const fetchEstimate = async () => {
            if (!path.trim()) {
                setEstimate(null)
                return
            }
            
            setIsEstimating(true)
            setEstimateError(null)
            
            try {
                const result = await estimateScan(path)
                setEstimate(result)
            } catch (err) {
                setEstimateError('Impossible d\'analyser ce chemin')
                setEstimate(null)
            } finally {
                setIsEstimating(false)
            }
        }
        
        const debounce = setTimeout(fetchEstimate, 500)
        return () => clearTimeout(debounce)
    }, [path])

    const fetchScans = async () => {
        setIsLoading(true)
        try {
            const response = await fetch('/api/scan/')
            if (response.ok) {
                const data = await response.json()
                setScans(Array.isArray(data) ? data : data.scans ?? [])
            }
        } catch (err) {
            console.error('Failed to fetch scans:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const formatNumber = (n: number) => {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
        return n.toString()
    }
    
    const getEstimatedCost = () => {
        if (!estimate || !enableEmbeddings || embeddingTier === 'free') return 0
        return estimate.embedding_estimate.estimated_cost_usd
    }

    const handleStartScan = async () => {
        if (!path.trim()) return
        
        // Show confirmation if cost > $24
        const cost = getEstimatedCost()
        if (cost > 24 && !showCostConfirm) {
            setShowCostConfirm(true)
            return
        }

        setIsStarting(true)
        setShowCostConfirm(false)
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

    const handleResumeScan = async (scanId: number) => {
        try {
            const response = await fetch(`/api/scan/${scanId}/resume`, {
                method: 'POST'
            })
            if (response.ok) {
                fetchScans()
            }
        } catch (err) {
            console.error('Failed to resume scan:', err)
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 className="h-5 w-5 text-green-500" />
            case 'running':
                return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
            case 'failed':
                return <XCircle className="h-5 w-5 text-red-500" />
            case 'cancelled':
                return <XCircle className="h-5 w-5 text-orange-500" />
            default:
                return <Clock className="h-5 w-5 text-muted-foreground" />
        }
    }

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'completed': return 'Terminé'
            case 'running': return 'En cours'
            case 'failed': return 'Échoué'
            case 'cancelled': return 'Annulé'
            case 'pending': return 'En attente'
            default: return status
        }
    }

    const formatDuration = (start: string, end?: string) => {
        const startDate = new Date(start)
        const endDate = end ? new Date(end) : new Date()
        const seconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000)
        
        if (seconds < 60) return `${seconds}s`
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    }

    return (
        <div className="h-full p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <Scan className="h-6 w-6 text-primary" />
                    <h2 className="text-2xl font-semibold">Gestion des Scans</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* LEFT: Scan Configuration */}
                    <div className="space-y-4">
                        <Card className="border-primary/20">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Settings className="h-5 w-5" />
                                    Configuration du Scan
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Path Input */}
                                <div className="space-y-2">
                                    <Label>Chemin du dossier</Label>
                                    <Input
                                        placeholder="/documents/votre-projet"
                                        value={path}
                                        onChange={(e) => setPath(e.target.value)}
                                        disabled={!!activeScanId}
                                    />
                                </div>
                                
                                {/* Estimation Preview */}
                                {isEstimating && (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Analyse en cours...
                                    </div>
                                )}
                                
                                {estimateError && (
                                    <div className="flex items-center gap-2 text-sm text-destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        {estimateError}
                                    </div>
                                )}
                                
                                {estimate && !isEstimating && (
                                    <div className="rounded-lg border bg-card/50 p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium">Aperçu</span>
                                            <Badge variant="outline">{formatNumber(estimate.file_count)} fichiers</Badge>
                                        </div>
                                        
                                        <div className="grid grid-cols-4 gap-2 text-sm">
                                            <div className="flex items-center gap-1.5">
                                                <FileText className="h-4 w-4 text-blue-500" />
                                                <span>{formatNumber(estimate.type_counts.pdf)} PDF</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Image className="h-4 w-4 text-green-500" />
                                                <span>{formatNumber(estimate.type_counts.image)} Img</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <FileText className="h-4 w-4 text-yellow-500" />
                                                <span>{formatNumber(estimate.type_counts.text)} Txt</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Video className="h-4 w-4 text-purple-500" />
                                                <span>{formatNumber(estimate.type_counts.video)} Vid</span>
                                            </div>
                                        </div>
                                        
                                        <div className="text-sm text-muted-foreground">
                                            Taille: {(estimate.size_mb / 1024).toFixed(1)} GB
                                        </div>
                                    </div>
                                )}
                                
                                <hr className="border-border/50" />
                                
                                {/* Embeddings Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="flex items-center gap-2">
                                                <Database className="h-4 w-4" />
                                                Recherche sémantique
                                            </Label>
                                            <p className="text-xs text-muted-foreground">
                                                Recherche par sens (ex: "paiement" → "virement")
                                            </p>
                                        </div>
                                        <Switch 
                                            checked={enableEmbeddings} 
                                            onCheckedChange={setEnableEmbeddings}
                                        />
                                    </div>
                                    
                                    {enableEmbeddings && (
                                        <div className="ml-6 space-y-3 border-l-2 border-primary/20 pl-4">
                                            <div className="space-y-2">
                                                <Label className="text-sm">Tier Gemini</Label>
                                                <Select value={embeddingTier} onValueChange={(v: string) => setEmbeddingTier(v as 'free' | 'paid')}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="free">
                                                            <div className="flex items-center gap-2">
                                                                <Zap className="h-4 w-4 text-green-500" />
                                                                <span>Gratuit (limites de débit)</span>
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="paid">
                                                            <div className="flex items-center gap-2">
                                                                <DollarSign className="h-4 w-4 text-yellow-500" />
                                                                <span>Payant (0.15$/M tokens)</span>
                                                            </div>
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            
                                            {estimate && (
                                                <div className="rounded bg-card p-2 text-sm">
                                                    {embeddingTier === 'free' ? (
                                                        <div className="flex items-center gap-2 text-green-500">
                                                            <CheckCircle2 className="h-4 w-4" />
                                                            <span>
                                                                {estimate.embedding_estimate.free_tier_available 
                                                                    ? 'Compatible tier gratuit' 
                                                                    : 'Volume élevé - traitement plus lent'}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-yellow-500">
                                                            <DollarSign className="h-4 w-4" />
                                                            <span>Coût estimé: ~{estimate.embedding_estimate.estimated_cost_usd}$</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                
                                <hr className="border-border/50" />
                                
                                {/* OCR Options */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label>OCR (Extraction de texte)</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Images et PDFs scannés
                                            </p>
                                        </div>
                                        <Switch checked={enableOcr} onCheckedChange={setEnableOcr} />
                                    </div>
                                    
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label>OCR Vidéo (Keyframes)</Label>
                                            <p className="text-xs text-muted-foreground">
                                                Texte des frames de vidéos
                                            </p>
                                        </div>
                                        <Switch checked={enableVideoOcr} onCheckedChange={setEnableVideoOcr} />
                                    </div>
                                </div>
                                
                                <hr className="border-border/50" />
                                
                                {/* File Type Filters */}
                                <div className="space-y-2">
                                    <Label>Types de fichiers</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { key: 'pdf', label: 'PDF', icon: FileText, color: 'text-blue-500' },
                                            { key: 'image', label: 'Images', icon: Image, color: 'text-green-500' },
                                            { key: 'text', label: 'Texte', icon: FileText, color: 'text-yellow-500' },
                                            { key: 'video', label: 'Vidéos', icon: Video, color: 'text-purple-500' },
                                        ].map(({ key, label, icon: Icon, color }) => (
                                            <div key={key} className="flex items-center justify-between rounded border p-2">
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
                                
                                {/* Summary */}
                                {estimate && !activeScanId && (
                                    <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-3">
                                        <div className="flex items-start gap-2">
                                            <Info className="h-4 w-4 text-primary mt-0.5" />
                                            <div className="text-sm space-y-1">
                                                <p className="font-medium">Résumé</p>
                                                <ul className="text-muted-foreground space-y-0.5">
                                                    <li>• {formatNumber(estimate.file_count)} fichiers à indexer</li>
                                                    <li>• OCR: {enableOcr ? 'Activé' : 'Désactivé'} (gratuit, local)</li>
                                                    <li>• Embeddings: {enableEmbeddings ? `Activé (${embeddingTier === 'free' ? 'Gratuit' : `~${estimate.embedding_estimate.estimated_cost_usd}$`})` : 'Désactivé'}</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Cost Confirmation */}
                                {showCostConfirm && (
                                    <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 space-y-3">
                                        <div className="flex items-center gap-2 text-destructive">
                                            <AlertTriangle className="h-5 w-5" />
                                            <span className="font-semibold">Confirmation requise</span>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            Le coût estimé des embeddings est de <strong className="text-foreground">{getEstimatedCost()}$</strong>.
                                            Êtes-vous sûr de vouloir continuer ?
                                        </p>
                                        <div className="flex gap-2">
                                            <Button 
                                                variant="destructive" 
                                                onClick={handleStartScan}
                                                disabled={isStarting}
                                            >
                                                {isStarting ? (
                                                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Démarrage...</>
                                                ) : (
                                                    <>Confirmer ({getEstimatedCost()}$)</>
                                                )}
                                            </Button>
                                            <Button 
                                                variant="outline" 
                                                onClick={() => setShowCostConfirm(false)}
                                            >
                                                Annuler
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Launch Button */}
                                {!showCostConfirm && (
                                    <Button
                                        className="w-full"
                                        size="lg"
                                        onClick={handleStartScan}
                                        disabled={!path.trim() || !!activeScanId || isStarting || !estimate}
                                    >
                                        {isStarting ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                Démarrage...
                                            </>
                                        ) : (
                                            <>
                                                <FolderSearch className="h-4 w-4 mr-2" />
                                                Lancer le Scan
                                            </>
                                        )}
                                    </Button>
                                )}
                                
                                {/* Active Scan Progress */}
                                {activeScanId && progress && (
                                    <div className="rounded-lg border bg-card p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium">Scan en cours</span>
                                            <Badge variant={progress.status === 'completed' ? 'default' : 'secondary'}>
                                                {progress.status === 'completed' ? 'Terminé' : 'En cours'}
                                            </Badge>
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

                                        {isComplete && (
                                            <div className="flex items-center gap-2 text-sm text-green-500">
                                                <CheckCircle2 className="h-4 w-4" />
                                                Scan terminé !
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT: Scans History */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium flex items-center gap-2">
                                <Clock className="h-5 w-5" />
                                Historique
                            </h3>
                            <Badge variant="secondary">{scans.length} scans</Badge>
                        </div>
                        
                        {isLoading ? (
                            <Card className="p-12">
                                <div className="text-center text-muted-foreground">
                                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                                    Chargement...
                                </div>
                            </Card>
                        ) : scans.length === 0 ? (
                            <Card className="p-8">
                                <div className="text-center text-muted-foreground">
                                    <FolderSearch className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                    <p className="font-medium">Aucun scan effectué</p>
                                    <p className="text-sm mt-1">
                                        Configurez et lancez votre premier scan
                                    </p>
                                </div>
                            </Card>
                        ) : (
                            <ScrollArea className="h-[calc(100vh-250px)]">
                                <div className="space-y-3">
                                    {scans.map(scan => (
                                        <Card key={scan.id} className="hover:bg-accent/30 transition-colors">
                                            <CardContent className="p-4">
                                                <div className="flex items-start gap-3">
                                                    {getStatusIcon(scan.status)}
                                                    
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="font-medium">Scan #{scan.id}</span>
                                                            <Badge 
                                                                variant={scan.status === 'completed' ? 'default' : scan.status === 'failed' ? 'destructive' : 'secondary'}
                                                            >
                                                                {getStatusLabel(scan.status)}
                                                            </Badge>
                                                        </div>
                                                        
                                                        <p className="text-sm text-muted-foreground truncate">
                                                            📁 {scan.path}
                                                        </p>

                                                        {scan.status === 'running' && scan.total_files > 0 && (
                                                            <div className="mt-2">
                                                                <Progress value={(scan.processed_files / scan.total_files) * 100} className="h-1" />
                                                                <span className="text-xs text-muted-foreground">
                                                                    {scan.processed_files}/{scan.total_files}
                                                                </span>
                                                            </div>
                                                        )}

                                                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                                            <span>{new Date(scan.started_at).toLocaleString()}</span>
                                                            {scan.completed_at && (
                                                                <span>• {formatDuration(scan.started_at, scan.completed_at)}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {(scan.status === 'failed' || scan.status === 'cancelled') && (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm"
                                                            onClick={() => handleResumeScan(scan.id)}
                                                        >
                                                            <Play className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
