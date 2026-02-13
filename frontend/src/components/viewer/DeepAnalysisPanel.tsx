/**
 * Deep Analysis Panel — LangExtract LLM-based structured extraction results
 *
 * Displayed inside DocumentViewer, auto-triggers analysis when a document is viewed.
 * Shows extracted entities, relationships, and AI summary.
 */
import { useState, useEffect, useCallback } from 'react'
import {
    Brain, Loader2, AlertTriangle, ChevronDown, ChevronRight,
    Users, Building2, MapPin, Clock, DollarSign, FileText, Link2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    getDeepAnalysis, triggerDeepAnalysis, getDeepAnalysisStatus,
    type DeepAnalysis, type DeepAnalysisExtraction, type DeepAnalysisRelationship
} from '@/lib/api'
import { useTranslation } from '@/contexts/I18nContext'

const ENTITY_CLASS_CONFIG: Record<string, { icon: typeof Users; color: string; label: string }> = {
    PER:   { icon: Users,     color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',       label: 'Personnes' },
    ORG:   { icon: Building2, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Organisations' },
    LOC:   { icon: MapPin,    color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',     label: 'Lieux' },
    DATE:  { icon: Clock,     color: 'text-purple-400 bg-purple-400/10 border-purple-400/20',  label: 'Dates' },
    MONEY: { icon: DollarSign, color: 'text-green-400 bg-green-400/10 border-green-400/20',    label: 'Montants' },
    DOC:   { icon: FileText,  color: 'text-slate-400 bg-slate-400/10 border-slate-400/20',     label: 'Références' },
    REL:   { icon: Link2,     color: 'text-rose-400 bg-rose-400/10 border-rose-400/20',        label: 'Relations' },
}

interface DeepAnalysisPanelProps {
    documentId: number
}

const analysisCache = new Map<number, DeepAnalysis>()
const statusCache = new Map<number, string>()

export function DeepAnalysisPanel({ documentId }: DeepAnalysisPanelProps) {
    const { t } = useTranslation()
    const [analysis, setAnalysis] = useState<DeepAnalysis | null>(null)
    const [status, setStatus] = useState<string>('none')
    const [isExpanded, setIsExpanded] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [pollingActive, setPollingActive] = useState(false)

    // Fetch analysis or trigger if missing
    const checkAnalysis = useCallback(async () => {
        const cached = analysisCache.get(documentId)
        const cachedStatus = statusCache.get(documentId)
        if (cached && cached.status === 'completed') {
            setAnalysis(cached)
            setStatus('completed')
            setIsLoading(false)
            setPollingActive(false)
            return
        }
        if (cachedStatus === 'running' || cachedStatus === 'pending') {
            setStatus(cachedStatus)
            setIsLoading(false)
            setPollingActive(true)
            return
        }

        try {
            const result = await getDeepAnalysis(documentId)
            if (result && result.status) {
                setAnalysis(result)
                setStatus(result.status)
                statusCache.set(documentId, result.status)
                if (result.status === 'completed') {
                    analysisCache.set(documentId, result)
                }
                setIsLoading(false)

                if (result.status === 'completed') {
                    setPollingActive(false)
                    return
                }
                if (result.status === 'running' || result.status === 'pending') {
                    setPollingActive(true)
                    return
                }
            }

            // No analysis exists — auto-trigger
            setStatus('triggering')
            try {
                const triggerResult = await triggerDeepAnalysis(documentId)
                if (triggerResult.status === 'already_completed') {
                    // Re-fetch the result
                    const refreshed = await getDeepAnalysis(documentId)
                    setAnalysis(refreshed)
                    setStatus('completed')
                    if (refreshed) {
                        analysisCache.set(documentId, refreshed)
                    }
                    statusCache.set(documentId, 'completed')
                } else {
                    setStatus('pending')
                    statusCache.set(documentId, 'pending')
                    setPollingActive(true)
                }
            } catch {
                setStatus('unavailable')
            }
            setIsLoading(false)
        } catch {
            setStatus('unavailable')
            setIsLoading(false)
        }
    }, [documentId])

    // Initial fetch
    useEffect(() => {
        setIsLoading(true)
        setAnalysis(null)
        setStatus('none')
        setIsExpanded(false)
        checkAnalysis()
    }, [documentId, checkAnalysis])

    // Polling for pending/running
    useEffect(() => {
        if (!pollingActive) return

        let cancelled = false
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        let delay = 3000

        const poll = async () => {
            if (cancelled) return
            try {
                const statusResult = await getDeepAnalysisStatus(documentId)
                setStatus(statusResult.status)
                statusCache.set(documentId, statusResult.status)

                if (statusResult.status === 'completed') {
                    setPollingActive(false)
                    const result = await getDeepAnalysis(documentId)
                    setAnalysis(result)
                    if (result) {
                        analysisCache.set(documentId, result)
                    }
                } else if (statusResult.status === 'failed') {
                    setPollingActive(false)
                } else if (!cancelled) {
                    delay = Math.min(10000, Math.floor(delay * 1.5))
                    timeoutId = setTimeout(poll, delay)
                }
            } catch {
                setPollingActive(false)
            }
        }
        timeoutId = setTimeout(poll, delay)

        return () => {
            cancelled = true
            if (timeoutId) clearTimeout(timeoutId)
        }
    }, [pollingActive, documentId])

    // Parse JSON fields
    const extractions: DeepAnalysisExtraction[] = analysis?.extractions
        ? (() => { try { return JSON.parse(analysis.extractions) } catch { return [] } })()
        : []

    const relationships: DeepAnalysisRelationship[] = analysis?.relationships
        ? (() => { try { return JSON.parse(analysis.relationships) } catch { return [] } })()
        : []

    // Group extractions by class
    const grouped = extractions.reduce((acc, ext) => {
        const cls = ext.class || 'UNKNOWN'
        if (!acc[cls]) acc[cls] = []
        acc[cls].push(ext)
        return acc
    }, {} as Record<string, DeepAnalysisExtraction[]>)

    // Don't render anything if unavailable
    if (status === 'unavailable' || status === 'none') return null

    // Status badge
    const StatusBadge = () => {
        if (status === 'completed') {
            return (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono">
                    {t('deepAnalysis.complete')}
                </span>
            )
        }
        if (status === 'running' || status === 'pending' || status === 'triggering') {
            return (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t('deepAnalysis.scanning')}
                </span>
            )
        }
        if (status === 'failed') {
            return (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-mono flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {t('deepAnalysis.error')}
                </span>
            )
        }
        return null
    }

    return (
        <div className="border-b border-border/50">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/30 transition-colors text-sm"
            >
                <div className="flex items-center gap-2">
                    {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-amber-400" />
                        : <ChevronRight className="h-4 w-4 text-amber-400" />
                    }
                    <Brain className="h-4 w-4 text-amber-400" />
                    <span className="font-medium text-amber-400">
                        {t('deepAnalysis.title')}
                    </span>
                    {extractions.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                            ({extractions.length} {t('deepAnalysis.entities')})
                        </span>
                    )}
                </div>
                <StatusBadge />
            </button>

            {isExpanded && (
                <div className="px-3 pb-3 space-y-3">
                    {isLoading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('deepAnalysis.scanning')}
                        </div>
                    )}

                    {/* Summary */}
                    {analysis?.summary && (
                        <div className="text-sm text-muted-foreground bg-card/50 rounded-md p-2 border border-border/30">
                            {analysis.summary}
                        </div>
                    )}

                    {/* Grouped Extractions */}
                    {Object.entries(grouped).map(([cls, items]) => {
                        const config = ENTITY_CLASS_CONFIG[cls] || {
                            icon: FileText,
                            color: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
                            label: cls
                        }
                        const Icon = config.icon

                        return (
                            <div key={cls} className="space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                    <Icon className={cn("h-3 w-3", config.color.split(' ')[0])} />
                                    {config.label} ({items.length})
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {items.map((ext, idx) => (
                                        <span
                                            key={idx}
                                            className={cn(
                                                "inline-flex items-center px-2 py-0.5 rounded-md text-xs border",
                                                config.color
                                            )}
                                            title={Object.entries(ext.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}
                                        >
                                            {ext.text}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )
                    })}

                    {/* Relationships */}
                    {relationships.length > 0 && (
                        <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                <Link2 className="h-3 w-3 text-rose-400" />
                                Relations ({relationships.length})
                            </div>
                            <div className="space-y-1">
                                {relationships.map((rel, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground bg-card/30 rounded p-1.5 border border-border/20">
                                        <span className="text-blue-400 font-medium">{rel.source}</span>
                                        <span className="text-rose-400">→ {rel.type} →</span>
                                        <span className="text-emerald-400 font-medium">{rel.target}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Processing metadata */}
                    {analysis?.processing_time_ms && (
                        <div className="text-xs text-muted-foreground/60 font-mono pt-1">
                            {analysis.model_used} · {(analysis.processing_time_ms / 1000).toFixed(1)}s
                        </div>
                    )}

                    {/* Error message */}
                    {status === 'failed' && analysis?.error_message && (
                        <div className="text-xs text-red-400 bg-red-500/5 rounded p-2 border border-red-500/20">
                            {analysis.error_message}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
