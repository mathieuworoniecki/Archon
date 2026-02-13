import { FolderSearch, Loader2, FileText, Image, Video, HardDrive, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { type ScanEstimate } from '@/lib/api'
import { useTranslation } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

interface ScanConfigPanelProps {
    projectName?: string
    projectPath?: string
    estimate: ScanEstimate | null
    isEstimating: boolean
    enableEmbeddings: boolean
    onEnableEmbeddingsChange: (enabled: boolean) => void
    className?: string
}

export function ScanConfigPanel({
    projectName,
    projectPath,
    estimate,
    isEstimating,
    enableEmbeddings,
    onEnableEmbeddingsChange,
    className,
}: ScanConfigPanelProps) {
    const { t } = useTranslation()

    const formatNumber = (n: number) => n.toLocaleString()

    const typeBadges = estimate
        ? [
            { key: 'pdf', icon: FileText, color: 'text-red-400', label: 'PDF', count: estimate.type_counts.pdf },
            { key: 'image', icon: Image, color: 'text-blue-400', label: t('scans.images'), count: estimate.type_counts.image },
            { key: 'text', icon: FileText, color: 'text-green-400', label: t('scans.text'), count: estimate.type_counts.text },
            { key: 'video', icon: Video, color: 'text-purple-400', label: t('scans.videos'), count: estimate.type_counts.video },
        ].filter((entry) => entry.count > 0)
        : []

    return (
        <div className={cn('space-y-4', className)}>
            <div className="rounded-lg border bg-card/40 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('scans.projectToScan')}</p>
                        <p className="font-medium truncate">{projectName || '-'}</p>
                        <p className="text-xs text-muted-foreground truncate">{projectPath || '-'}</p>
                    </div>
                    {estimate && (
                        <Badge variant="secondary">
                            {formatNumber(estimate.file_count)} {t('scans.filesCount')}
                        </Badge>
                    )}
                </div>
            </div>

            <div className="rounded-lg border bg-muted/25 p-4 space-y-3">
                {isEstimating ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('scans.estimating')}
                    </div>
                ) : estimate ? (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border bg-card/40 p-3">
                                <div className="text-xs text-muted-foreground">{t('scans.filesCount')}</div>
                                <div className="text-lg font-semibold">{formatNumber(estimate.file_count)}</div>
                            </div>
                            <div className="rounded-lg border bg-card/40 p-3">
                                <div className="text-xs text-muted-foreground">{t('scans.totalSize')}</div>
                                <div className="text-lg font-semibold">
                                    {estimate.size_mb >= 1000
                                        ? `${(estimate.size_mb / 1024).toFixed(1)} GB`
                                        : `${estimate.size_mb.toFixed(1)} MB`}
                                </div>
                            </div>
                        </div>
                        {typeBadges.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {typeBadges.map(({ key, icon: Icon, color, label, count }) => (
                                    <span
                                        key={key}
                                        className="inline-flex items-center gap-1.5 rounded-full border bg-card/50 px-2.5 py-1 text-xs"
                                    >
                                        <Icon className={cn('h-3.5 w-3.5', color)} />
                                        {formatNumber(count)} {label}
                                    </span>
                                ))}
                            </div>
                        )}
                        {estimate.sampled && (
                            <p className="text-xs text-muted-foreground">{t('scans.sampleEstimate')}</p>
                        )}
                    </>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <FolderSearch className="h-4 w-4" />
                        {t('scans.projectToScan')}
                    </div>
                )}
            </div>

            <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="rounded-md bg-purple-500/10 p-2">
                            <Zap className={cn('h-4 w-4', enableEmbeddings ? 'text-purple-400' : 'text-muted-foreground')} />
                        </div>
                        <div>
                            <Label className="font-medium">{t('scans.aiEmbeddings')}</Label>
                            <p className="text-xs text-muted-foreground">{t('scans.semanticSearch')}</p>
                        </div>
                    </div>
                    <Switch checked={enableEmbeddings} onCheckedChange={onEnableEmbeddingsChange} />
                </div>

                {enableEmbeddings && estimate?.embedding_estimate && (
                    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-xs">
                        <div className="flex items-center gap-2 text-purple-200">
                            <HardDrive className="h-3.5 w-3.5" />
                            {t('scans.embeddingsCost')}:{' '}
                            <strong>
                                {estimate.embedding_estimate.free_tier_available
                                    ? t('scans.free')
                                    : `$${estimate.embedding_estimate.estimated_cost_usd.toFixed(2)}`}
                            </strong>
                        </div>
                        <div className="mt-1 text-muted-foreground">
                            {formatNumber(estimate.embedding_estimate.estimated_tokens)} {t('scans.tokens')}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
