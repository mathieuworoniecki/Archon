import { useState, useEffect } from 'react'
import { 
    FolderSearch, Settings, AlertCircle, CheckCircle2, 
    DollarSign, Zap, FileText, Image, Video, Database, 
    Loader2, Info, ChevronDown, ChevronUp, AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useScanProgress } from '@/hooks/useScanProgress'
import { createScan, getScans, estimateScan, Scan, ScanEstimate } from '@/lib/api'

interface ScanModalProps {
    onScanComplete?: () => void
}

export function ScanModal({ onScanComplete }: ScanModalProps) {
    const [open, setOpen] = useState(false)
    const [path, setPath] = useState('/documents')
    const [activeScanId, setActiveScanId] = useState<number | null>(null)
    const [scans, setScans] = useState<Scan[]>([])
    const [isStarting, setIsStarting] = useState(false)
    const [showOptions, setShowOptions] = useState(true)  // Options visibles par défaut
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
    
    const formatNumber = (n: number) => {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
        return n.toString()
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <FolderSearch className="h-4 w-4" />
                    Scanner
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Configuration du Scan
                    </DialogTitle>
                    <DialogDescription>
                        Configurez les options et lancez l'indexation des documents
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
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
                                <span className="font-medium">Aperçu du scan</span>
                                <Badge variant="outline">{formatNumber(estimate.file_count)} fichiers</Badge>
                            </div>
                            
                            {/* File type breakdown */}
                            <div className="grid grid-cols-4 gap-2 text-sm">
                                <div className="flex items-center gap-1.5">
                                    <FileText className="h-4 w-4 text-blue-500" />
                                    <span>{formatNumber(estimate.type_counts.pdf)} PDF</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Image className="h-4 w-4 text-green-500" />
                                    <span>{formatNumber(estimate.type_counts.image)} Images</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <FileText className="h-4 w-4 text-yellow-500" />
                                    <span>{formatNumber(estimate.type_counts.text)} Texte</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Video className="h-4 w-4 text-purple-500" />
                                    <span>{formatNumber(estimate.type_counts.video)} Vidéos</span>
                                </div>
                            </div>
                            
                            <div className="text-sm text-muted-foreground">
                                Taille totale: {estimate.size_mb} MB
                            </div>
                        </div>
                    )}
                    
                    {/* Options Toggle */}
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-between"
                        onClick={() => setShowOptions(!showOptions)}
                    >
                        <span className="flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            Options avancées
                        </span>
                        {showOptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    
                    {/* Advanced Options Panel */}
                    {showOptions && (
                        <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                            
                            {/* Embeddings Section */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="flex items-center gap-2">
                                            <Database className="h-4 w-4" />
                                            Recherche sémantique (Embeddings)
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            Permet la recherche par sens (ex: "paiement" trouve "virement")
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
                                            Extrait le texte des images et PDFs scannés
                                        </p>
                                    </div>
                                    <Switch checked={enableOcr} onCheckedChange={setEnableOcr} />
                                </div>
                                
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label>OCR Vidéo (Keyframes)</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Extrait le texte des frames de vidéos
                                        </p>
                                    </div>
                                    <Switch checked={enableVideoOcr} onCheckedChange={setEnableVideoOcr} />
                                </div>
                            </div>
                            
                            <hr className="border-border/50" />
                            
                            {/* File Type Filters */}
                            <div className="space-y-2">
                                <Label>Types de fichiers à indexer</Label>
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
                        </div>
                    )}
                    
                    {/* Cost Summary */}
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
                    
                    {/* Cost Confirmation Dialog */}
                    {showCostConfirm && (
                        <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 space-y-3">
                            <div className="flex items-center gap-2 text-destructive">
                                <AlertTriangle className="h-5 w-5" />
                                <span className="font-semibold">Confirmation requise</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Le coût estimé des embeddings est de <strong className="text-foreground">{getEstimatedCost()}$</strong>.
                                Êtes-vous sûr de vouloir continuer avec le tier payant ?
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
                    {scans.length > 0 && !activeScanId && (
                        <div className="space-y-2">
                            <Label>Scans récents</Label>
                            <ScrollArea className="h-[120px]">
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
