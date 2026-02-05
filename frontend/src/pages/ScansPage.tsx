import { useState, useEffect, useCallback } from 'react'
import { Scan, FolderSearch, CheckCircle2, XCircle, Clock, RefreshCw, FileText, Image, FileType2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { ScanModal } from '@/components/scan/ScanModal'


interface ScanRecord {
    id: number
    path: string
    status: 'completed' | 'in_progress' | 'failed'
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

    // Fetch scans on mount
    useEffect(() => {
        fetchScans()
    }, [])

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

    const handleScanComplete = useCallback(() => {
        fetchScans()
    }, [])

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 className="h-5 w-5 text-green-500" />
            case 'in_progress':
                return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
            case 'failed':
                return <XCircle className="h-5 w-5 text-red-500" />
            default:
                return <Clock className="h-5 w-5 text-muted-foreground" />
        }
    }

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'completed': return 'Terminé'
            case 'in_progress': return 'En cours'
            case 'failed': return 'Échoué'
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

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="animate-pulse text-muted-foreground">Chargement des scans...</div>
            </div>
        )
    }

    return (
        <div className="h-full p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Scan className="h-6 w-6 text-primary" />
                        <h2 className="text-2xl font-semibold">Historique des Scans</h2>
                        <Badge variant="secondary">{scans.length} scans</Badge>
                    </div>
                    <ScanModal onScanComplete={handleScanComplete} />
                </div>

                {/* Scans List */}
                {scans.length === 0 ? (
                    <Card className="p-12">
                        <div className="text-center text-muted-foreground">
                            <FolderSearch className="h-16 w-16 mx-auto mb-4 opacity-20" />
                            <p className="font-medium text-lg">Aucun scan effectué</p>
                            <p className="text-sm mt-2">
                                Lancez votre premier scan pour indexer vos documents
                            </p>
                            <div className="mt-6">
                                <ScanModal onScanComplete={handleScanComplete} />
                            </div>
                        </div>
                    </Card>
                ) : (
                    <ScrollArea className="h-[calc(100vh-200px)]">
                        <div className="space-y-4">
                            {scans.map(scan => (
                                <Card key={scan.id} className="hover:bg-accent/30 transition-colors">
                                    <CardContent className="p-4">
                                        <div className="flex items-start gap-4">
                                            {/* Status Icon */}
                                            <div className="mt-1">
                                                {getStatusIcon(scan.status)}
                                            </div>

                                            {/* Main Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium">Scan #{scan.id}</span>
                                                    <Badge 
                                                        variant={scan.status === 'completed' ? 'default' : scan.status === 'failed' ? 'destructive' : 'secondary'}
                                                    >
                                                        {getStatusLabel(scan.status)}
                                                    </Badge>
                                                </div>
                                                
                                                <p className="text-sm text-muted-foreground truncate mb-2">
                                                    📁 {scan.path}
                                                </p>

                                                {/* Progress Bar (for in-progress scans) */}
                                                {scan.status === 'in_progress' && scan.total_files > 0 && (
                                                    <div className="mb-2">
                                                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                                            <span>{scan.processed_files} / {scan.total_files} fichiers</span>
                                                            <span>{Math.round((scan.processed_files / scan.total_files) * 100)}%</span>
                                                        </div>
                                                        <Progress value={(scan.processed_files / scan.total_files) * 100} />
                                                    </div>
                                                )}

                                                {/* Stats */}
                                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {new Date(scan.started_at).toLocaleString()}
                                                    </span>
                                                    {scan.completed_at && (
                                                        <span>Durée: {formatDuration(scan.started_at, scan.completed_at)}</span>
                                                    )}
                                                    {scan.error_count > 0 && (
                                                        <span className="text-red-500">
                                                            {scan.error_count} erreur(s)
                                                        </span>
                                                    )}
                                                </div>

                                                {/* File Types Breakdown */}
                                                {scan.documents_by_type && (
                                                    <div className="flex items-center gap-3 mt-2">
                                                        {scan.documents_by_type.pdf > 0 && (
                                                            <Badge variant="outline" className="gap-1">
                                                                <FileText className="h-3 w-3 text-red-500" />
                                                                {scan.documents_by_type.pdf} PDF
                                                            </Badge>
                                                        )}
                                                        {scan.documents_by_type.image > 0 && (
                                                            <Badge variant="outline" className="gap-1">
                                                                <Image className="h-3 w-3 text-blue-500" />
                                                                {scan.documents_by_type.image} Images
                                                            </Badge>
                                                        )}
                                                        {scan.documents_by_type.text > 0 && (
                                                            <Badge variant="outline" className="gap-1">
                                                                <FileType2 className="h-3 w-3 text-green-500" />
                                                                {scan.documents_by_type.text} Texte
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm">
                                                    Détails
                                                </Button>
                                                {scan.status === 'completed' && (
                                                    <Button variant="outline" size="sm">
                                                        <RefreshCw className="h-4 w-4 mr-1" />
                                                        Re-scanner
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </div>
        </div>
    )
}
