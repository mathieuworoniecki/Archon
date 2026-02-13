import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Users, Hash, Search, FileText, ArrowRight, Network, Loader2, Clock, AlertTriangle, RefreshCw, Merge, Check } from 'lucide-react'
import { useProject } from '@/contexts/ProjectContext'
import { useTranslation } from '@/contexts/I18nContext'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useEntities, EntityAggregation, EntityDocument } from '@/hooks/useEntities'
import { cn } from '@/lib/utils'
import { ENTITY_TYPES, getEntityLabel, type EntityType } from '@/lib/entityTypes'
import { toast } from 'sonner'
import { authFetch } from '@/lib/auth'
import { API_BASE } from '@/lib/api'



export function EntitiesPage() {
    const [activeType, setActiveType] = useState<EntityType | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedEntity, setSelectedEntity] = useState<EntityAggregation | null>(null)
    const [relatedDocs, setRelatedDocs] = useState<EntityDocument[]>([])
    const [isLoadingDocs, setIsLoadingDocs] = useState(false)
    type MergePhase = 'idle' | 'selecting' | 'submitting'
    const [mergePhase, setMergePhase] = useState<MergePhase>('idle')
    const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set())
    const mergeMode = mergePhase !== 'idle'
    const isMerging = mergePhase === 'submitting'
    const canMerge = useMemo(() => mergeSelected.size >= 2 && !isMerging, [mergeSelected.size, isMerging])

    const { entities, typeSummary, isLoading, error, refetch, searchDocumentsByEntity } = useEntities({
        entityType: activeType || undefined,
        search: searchQuery || undefined,
        limit: 100,
    })

    // Fetch related documents when an entity is selected
    useEffect(() => {
        if (!selectedEntity) {
            setRelatedDocs([])
            return
        }

        setIsLoadingDocs(true)
        searchDocumentsByEntity(selectedEntity.text, selectedEntity.type, 50)
            .then(setRelatedDocs)
            .catch(() => { /* handled by hook error state */ })
            .finally(() => setIsLoadingDocs(false))
    }, [selectedEntity, searchDocumentsByEntity])

    const { selectedProject } = useProject()
    const { t } = useTranslation()
    const totalEntities = typeSummary.reduce((sum, row) => sum + row.unique_count, 0)
    const totalMentions = typeSummary.reduce((sum, row) => sum + row.count, 0)
    const contextLine = t('entities.contextLine')
        .replace('{project}', selectedProject?.name ?? '—')
        .replace('{count}', totalEntities.toLocaleString())
        .replace('{mentions}', totalMentions.toLocaleString())

    const runMerge = useCallback(async () => {
        if (!canMerge) return

        setMergePhase('submitting')
        try {
            const selectedEntities = Array.from(mergeSelected).map((key) => {
                const [type, text] = key.split('::')
                return { type, text }
            })

            const types = new Set(selectedEntities.map((entity) => entity.type))
            if (types.size > 1) {
                toast.error(t('entities.mergeSameType'))
                setMergePhase('selecting')
                return
            }

            await authFetch(`${API_BASE}/entities/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    entities: selectedEntities.map((entity) => entity.text),
                    canonical: selectedEntities[0].text,
                    entity_type: selectedEntities[0].type,
                }),
            })

            toast.success(t('entities.mergeSuccess'))
            setMergeSelected(new Set())
            setMergePhase('idle')
            refetch()
        } catch {
            toast.error(t('entities.mergeError'))
            setMergePhase('selecting')
        }
    }, [canMerge, mergeSelected, refetch, t])

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="shrink-0 p-6 pb-4">
                <div className="max-w-7xl mx-auto">
                    <p className="text-xs text-muted-foreground mb-1">{contextLine}</p>
                    <div className="flex items-center gap-3 mb-5">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
                            <Network className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">{t('entities.title')}</h1>
                            <p className="text-sm text-muted-foreground">
                                {totalEntities.toLocaleString()} {t('entities.uniqueEntities')} · {totalMentions.toLocaleString()} {t('entities.mentions')}
                            </p>
                        </div>
                    </div>

                    {/* Stats + Type Filters */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <Button
                            variant={!activeType ? "default" : "outline"}
                            size="sm"
                            onClick={() => setActiveType(null)}
                            className="h-8 text-xs"
                        >
                            {t('entities.all')}
                            <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                                {totalEntities}
                            </Badge>
                        </Button>
                        {(Object.keys(ENTITY_TYPES) as EntityType[]).map(type => {
                            const config = ENTITY_TYPES[type]
                            const summary = typeSummary.find(t => t.type === type)
                            if (!summary) return null

                            const Icon = config.icon
                            return (
                                <Button
                                    key={type}
                                    variant={activeType === type ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setActiveType(activeType === type ? null : type)}
                                    className={cn("h-8 text-xs gap-1.5", activeType !== type && config.color)}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {getEntityLabel(type, t)}
                                    <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                                        {summary.unique_count}
                                    </Badge>
                                </Button>
                            )
                        })}

                        <div className="flex-1 min-w-[200px] max-w-xs ml-auto">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    placeholder={t('entities.search')}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="h-8 pl-8 text-sm"
                                />
                            </div>
                        </div>

                        {/* Merge mode toggle */}
                        <Button
                            variant={mergeMode ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                                if (isMerging) return
                                setMergePhase((prev) => (prev === 'idle' ? 'selecting' : 'idle'))
                                setMergeSelected(new Set())
                            }}
                            disabled={isMerging}
                            className="h-8 text-xs gap-1.5"
                        >
                            <Merge className="h-3.5 w-3.5" />
                            {t('entities.merge')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="shrink-0 px-6">
                    <div className="max-w-7xl mx-auto flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                        <p className="text-sm text-red-400 flex-1">{t('entities.loadError')}</p>
                        <Button variant="outline" size="sm" onClick={refetch} className="gap-1.5 shrink-0">
                            <RefreshCw className="h-3.5 w-3.5" />
                            {t('common.retry')}
                        </Button>
                    </div>
                </div>
            )}

            {/* Main Content — 2 columns */}
            <div className="flex-1 overflow-hidden px-6">
                <div className="max-w-7xl mx-auto h-full flex gap-4">
                    {/* Left: Entity List */}
                    <div className="flex-1 min-w-0">
                        <Card className="h-full flex flex-col">
                            <CardHeader className="py-3 px-4 shrink-0">
                                <CardTitle className="text-sm font-medium flex items-center justify-between">
                                    <span>{entities.length} entités</span>
                                    {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                </CardTitle>
                            </CardHeader>
                            <ScrollArea className="flex-1">
                                <div className="px-2 pb-2">
                                    {entities.map((entity, idx) => {
                                        const config = ENTITY_TYPES[entity.type as EntityType]
                                        const isSelected = selectedEntity?.text === entity.text && selectedEntity?.type === entity.type
                                        const mergeKey = `${entity.type}::${entity.text}`
                                        const isMergeChecked = mergeSelected.has(mergeKey)

                                        return (
                                            <button
                                                key={`${entity.type}-${entity.text}-${idx}`}
                                                onClick={() => {
                                                    if (isMerging) return
                                                    if (mergeMode) {
                                                        setMergeSelected(prev => {
                                                            const next = new Set(prev)
                                                            if (next.has(mergeKey)) next.delete(mergeKey)
                                                            else next.add(mergeKey)
                                                            return next
                                                        })
                                                    } else {
                                                        setSelectedEntity(isSelected ? null : entity)
                                                    }
                                                }}
                                                className={cn(
                                                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left",
                                                    "transition-all duration-150 group",
                                                    mergeMode && isMergeChecked
                                                        ? "bg-primary/10 ring-1 ring-primary/30"
                                                        : isSelected && !mergeMode
                                                        ? "bg-primary/10 ring-1 ring-primary/30"
                                                        : "hover:bg-accent/50"
                                                )}
                                            >
                                                {mergeMode && (
                                                    <div className={cn(
                                                        "shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors",
                                                        isMergeChecked ? "bg-primary border-primary" : "border-muted-foreground/30"
                                                    )}>
                                                        {isMergeChecked && <Check className="h-3 w-3 text-primary-foreground" />}
                                                    </div>
                                                )}
                                                {config && (
                                                    <div className={cn(
                                                        "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border",
                                                        config.bg
                                                    )}>
                                                        <config.icon className={cn("h-4 w-4", config.color)} />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{entity.text}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {entity.total_count} mentions · {entity.document_count} doc{entity.document_count > 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                                <Badge
                                                    variant="outline"
                                                    className={cn("text-[10px] h-5 px-1.5 shrink-0", config?.color)}
                                                >
                                                    {entity.type}
                                                </Badge>
                                            </button>
                                        )
                                    })}

                                    {!isLoading && entities.length === 0 && (
                                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                            <Users className="h-10 w-10 mb-3 opacity-40" />
                                            <p className="text-sm">{t('entities.noEntities')}</p>
                                            {searchQuery && (
                                                <p className="text-xs mt-1">{t('entities.tryAnother')}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                            {/* Merge action bar */}
                            {mergeMode && (
                                <div className="shrink-0 p-3 border-t bg-primary/5 flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">
                                        {mergeSelected.size} {t('entities.selected')}
                                    </span>
                                    <Button
                                        size="sm"
                                        onClick={runMerge}
                                        disabled={!canMerge}
                                        className="gap-1.5"
                                    >
                                        {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />}
                                        {t('entities.mergeAction')}
                                    </Button>
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Right: Entity Detail Panel */}
                    <div className="w-[380px] shrink-0">
                        {selectedEntity ? (
                            <EntityDetailPanel
                                entity={selectedEntity}
                                documents={relatedDocs}
                                isLoading={isLoadingDocs}
                                onSelectEntity={(e) => setSelectedEntity(e)}
                            />
                        ) : (
                            <Card className="h-full flex items-center justify-center">
                                <div className="text-center text-muted-foreground p-6">
                                    <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm font-medium">{t('entities.selectEntity')}</p>
                                    <p className="text-xs mt-1">
                                        {t('entities.selectEntityHint')}
                                    </p>
                                </div>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Entity Detail Panel ─────────────────────────────────

function EntityDetailPanel({
    entity,
    documents,
    isLoading,
    onSelectEntity,
}: {
    entity: EntityAggregation
    documents: EntityDocument[]
    isLoading: boolean
    onSelectEntity?: (entity: EntityAggregation) => void
}) {
    const config = ENTITY_TYPES[entity.type as EntityType]
    const Icon = config?.icon || Hash
    const { t } = useTranslation()

    // Co-occurrence data
    const [coOccurrences, setCoOccurrences] = useState<{ text: string; type: string; weight: number }[]>([])
    const coOccurrenceRequestSeqRef = useRef(0)

    useEffect(() => {
        const requestSeq = coOccurrenceRequestSeqRef.current + 1
        coOccurrenceRequestSeqRef.current = requestSeq
        const controller = new AbortController()

        const fetchCoOccurrences = async () => {
            try {
                const resp = await authFetch(`${API_BASE}/entities/graph?limit=60&min_count=1`, {
                    signal: controller.signal,
                })
                if (!resp.ok) throw new Error('Failed to fetch entity graph')
                const data = await resp.json()
                const entityKey = `${entity.type}:${entity.text}`
                const neighbors: Map<string, number> = new Map()
                for (const edge of data.edges) {
                    if (edge.source === entityKey) {
                        neighbors.set(edge.target, (neighbors.get(edge.target) || 0) + edge.weight)
                    } else if (edge.target === entityKey) {
                        neighbors.set(edge.source, (neighbors.get(edge.source) || 0) + edge.weight)
                    }
                }
                const sorted = [...neighbors.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([key, weight]) => {
                        const [type, ...textParts] = key.split(':')
                        return { text: textParts.join(':'), type, weight }
                    })
                if (coOccurrenceRequestSeqRef.current !== requestSeq) return
                setCoOccurrences(sorted)
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return
                if (coOccurrenceRequestSeqRef.current !== requestSeq) return
                setCoOccurrences([])
            }
        }
        fetchCoOccurrences()
        return () => controller.abort()
    }, [entity.text, entity.type])

    return (
        <Card className="h-full flex flex-col">
            {/* Entity Header */}
            <div className={cn(
                "shrink-0 p-4 border-b rounded-t-lg",
                "bg-gradient-to-r from-card to-card"
            )}>
                <div className="flex items-start gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center border",
                        config?.bg
                    )}>
                        <Icon className={cn("h-5 w-5", config?.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold truncate">{entity.text}</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className={cn("text-xs", config?.color)}>
                                {entity.type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                                {entity.total_count} mentions
                            </span>
                        </div>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/30 rounded-md px-2.5 py-1.5">
                        <FileText className="h-3.5 w-3.5" />
                        <span>{entity.document_count} document{entity.document_count > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground bg-accent/30 rounded-md px-2.5 py-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{entity.total_count} mentions</span>
                    </div>
                </div>

                {/* View in Graph */}
                <Link
                    to={`/graph?search=${encodeURIComponent(entity.text)}`}
                    className="mt-3 flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-colors"
                >
                    <Network className="h-3.5 w-3.5" />
                    {t('entities.viewInGraph')}
                </Link>

                {/* Co-occurrence */}
                {coOccurrences.length > 0 && (
                    <div className="mt-3">
                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            {t('entities.oftenSeenWith')}
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                            {coOccurrences.map(co => {
                                const coConfig = ENTITY_TYPES[co.type as EntityType]
                                return (
                                    <button
                                        key={`${co.type}:${co.text}`}
                                        className={cn(
                                            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border cursor-pointer transition-colors hover:bg-accent/60",
                                            coConfig?.bg
                                        )}
                                        onClick={() => onSelectEntity?.({ text: co.text, type: co.type, total_count: 0, document_count: 0 })}
                                    >
                                        {coConfig && <coConfig.icon className={cn("h-3 w-3", coConfig.color)} />}
                                        <span className="truncate max-w-[120px]">{co.text}</span>
                                        <Badge variant="secondary" className="text-[9px] h-3.5 px-1 ml-0.5">{co.weight}</Badge>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Related Documents */}
            <div className="shrink-0 px-4 pt-3 pb-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t('entities.documentsFor')}
                </h4>
            </div>

            <ScrollArea className="flex-1">
                <div className="px-2 pb-2 space-y-1">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : documents.length > 0 ? (
                        documents.map((doc) => (
                            <Link
                                key={doc.document_id}
                                to={`/analysis?q=${encodeURIComponent(doc.file_name)}`}
                                className={cn(
                                    "flex items-center gap-2.5 px-3 py-2 rounded-lg",
                                    "hover:bg-accent/60 transition-colors group"
                                )}
                            >
                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm truncate group-hover:text-foreground">
                                        {doc.file_name}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {doc.file_path}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                        ×{doc.entity_count}
                                    </Badge>
                                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </Link>
                        ))
                    ) : (
                        <div className="text-center py-8 text-muted-foreground text-xs">
                            {t('entities.noDocuments')}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </Card>
    )
}
