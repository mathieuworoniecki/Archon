import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Network, Maximize2, Minimize2, Settings2, AlertTriangle, RefreshCw, Route, X, Palette } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RelationshipGraph } from '@/components/graph/RelationshipGraph'
import { authFetch } from '@/lib/auth'
import { API_BASE } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProject } from '@/contexts/ProjectContext'
import { useTranslation } from '@/contexts/I18nContext'
import { ENTITY_TYPES, getEntityLabel, type EntityType } from '@/lib/entityTypes'
import { GraphSkeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'



interface GraphData {
    nodes: Array<{
        id: string
        text: string
        type: string
        total_count: number
        document_count: number
    }>
    edges: Array<{
        source: string
        target: string
        weight: number
    }>
}

export function GraphPage() {
    const { selectedProject } = useProject()
    const { t } = useTranslation()
    const [data, setData] = useState<GraphData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeType, setActiveType] = useState<EntityType | null>(null)
    const [nodeLimit, setNodeLimit] = useState(60)
    const [minCount, setMinCount] = useState(1)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 900, height: 600 })
    // Path-finding state
    const [pathMode, setPathMode] = useState(false)
    const [pathStart, setPathStart] = useState<string | null>(null)
    const [pathEnd, setPathEnd] = useState<string | null>(null)
    const [showCommunities, setShowCommunities] = useState(false)
    const requestSeqRef = useRef(0)

    // Measure container
    const measureContainer = useCallback(() => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setDimensions({
                width: Math.max(280, rect.width - 32),
                height: isFullscreen ? Math.max(320, window.innerHeight - 80) : Math.max(320, rect.height - 120),
            })
        }
    }, [isFullscreen])

    useEffect(() => {
        measureContainer()
        window.addEventListener('resize', measureContainer)
        return () => window.removeEventListener('resize', measureContainer)
    }, [measureContainer])

    // Fetch graph data
    const fetchGraph = useCallback(async () => {
        const requestId = ++requestSeqRef.current
        setIsLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams()
            if (activeType) params.set('entity_type', activeType)
            params.set('limit', nodeLimit.toString())
            params.set('min_count', minCount.toString())
            if (selectedProject?.path) params.set('project_path', selectedProject.path)

            const res = await authFetch(`${API_BASE}/entities/graph?${params}`)
            if (!res.ok) {
                const details = await res.text().catch(() => '')
                throw new Error(details || 'Failed to fetch graph data')
            }

            const payload = await res.json()
            if (requestId !== requestSeqRef.current) return
            setData(payload)
        } catch (err) {
            if (requestId !== requestSeqRef.current) return
            setError(err instanceof Error ? err.message : 'Failed to fetch graph data')
        } finally {
            if (requestId === requestSeqRef.current) setIsLoading(false)
        }
    }, [activeType, nodeLimit, minCount, selectedProject?.path])

    useEffect(() => { fetchGraph() }, [fetchGraph])

    const handleNodeClick = (node: { id: string; text: string; type: string }) => {
        if (pathMode) {
            if (!pathStart) {
                setPathStart(node.id)
            } else if (!pathEnd && node.id !== pathStart) {
                setPathEnd(node.id)
            } else {
                // Reset and start over
                setPathStart(node.id)
                setPathEnd(null)
            }
            return
        }
        window.open(`/entities?search=${encodeURIComponent(node.text)}`, '_self')
    }

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen)
        setTimeout(measureContainer, 100)
    }

    const edgeEndpointId = (value: string | { id: string }): string => {
        if (typeof value === 'string') return value
        return value.id
    }

    const graphView = useMemo(() => {
        if (!data) return null

        const originalNodes = data.nodes.length
        const originalEdges = data.edges.length
        const NODE_SOFT_LIMIT = 280
        const EDGE_SOFT_LIMIT = 2200

        if (originalNodes <= NODE_SOFT_LIMIT && originalEdges <= EDGE_SOFT_LIMIT) {
            return {
                nodes: data.nodes,
                edges: data.edges,
                reduced: false,
                originalNodes,
                originalEdges,
            }
        }

        const rankedNodes = [...data.nodes]
            .sort((a, b) => {
                if (b.document_count !== a.document_count) return b.document_count - a.document_count
                return b.total_count - a.total_count
            })
            .slice(0, NODE_SOFT_LIMIT)

        const allowedNodeIds = new Set(rankedNodes.map((node) => node.id))
        const reducedEdges = data.edges
            .filter((edge) => allowedNodeIds.has(edgeEndpointId(edge.source)) && allowedNodeIds.has(edgeEndpointId(edge.target)))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, EDGE_SOFT_LIMIT)

        const connectedNodeIds = new Set<string>()
        for (const edge of reducedEdges) {
            connectedNodeIds.add(edgeEndpointId(edge.source))
            connectedNodeIds.add(edgeEndpointId(edge.target))
        }

        const reducedNodes = rankedNodes.filter((node) => reducedEdges.length === 0 || connectedNodeIds.has(node.id))

        return {
            nodes: reducedNodes,
            edges: reducedEdges,
            reduced: true,
            originalNodes,
            originalEdges,
        }
    }, [data])

    const graphNodes = graphView?.nodes ?? []
    const graphEdges = graphView?.edges ?? []

    // BFS shortest path
    const shortestPath = useMemo(() => {
        if (!pathStart || !pathEnd || graphEdges.length === 0) return null
        const adj: Record<string, string[]> = {}
        for (const edge of graphEdges) {
            const source = edgeEndpointId(edge.source)
            const target = edgeEndpointId(edge.target)
            if (!adj[source]) adj[source] = []
            if (!adj[target]) adj[target] = []
            adj[source].push(target)
            adj[target].push(source)
        }
        const queue: string[][] = [[pathStart]]
        const visited = new Set<string>([pathStart])
        while (queue.length > 0) {
            const path = queue.shift()!
            const current = path[path.length - 1]
            if (current === pathEnd) return path
            for (const neighbor of (adj[current] || [])) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor)
                    queue.push([...path, neighbor])
                }
            }
        }
        return [] // no path
    }, [pathStart, pathEnd, graphEdges])

    const getNodeName = (id: string) => graphNodes.find((n) => n.id === id)?.text || data?.nodes.find((n) => n.id === id)?.text || id

    // Label propagation community detection
    const communities = useMemo(() => {
        if (!showCommunities || graphNodes.length === 0) return new Map<string, number>()

        // Initialize: each node is its own community
        const labels = new Map<string, number>()
        graphNodes.forEach((n, i) => labels.set(n.id, i))

        // Build adjacency list with weights
        const adj = new Map<string, { neighbor: string; weight: number }[]>()
        for (const edge of graphEdges) {
            const s = edgeEndpointId(edge.source)
            const t = edgeEndpointId(edge.target)
            if (!adj.has(s)) adj.set(s, [])
            if (!adj.has(t)) adj.set(t, [])
            adj.get(s)!.push({ neighbor: t, weight: edge.weight })
            adj.get(t)!.push({ neighbor: s, weight: edge.weight })
        }

        // Iterate label propagation (10 rounds)
        const nodeIds = graphNodes.map(n => n.id)
        for (let iter = 0; iter < 10; iter++) {
            let changed = false
            // Shuffle order
            const shuffled = [...nodeIds].sort(() => Math.random() - 0.5)
            for (const nodeId of shuffled) {
                const neighbors = adj.get(nodeId) || []
                if (neighbors.length === 0) continue
                // Weighted vote
                const votes = new Map<number, number>()
                for (const { neighbor, weight } of neighbors) {
                    const label = labels.get(neighbor)!
                    votes.set(label, (votes.get(label) || 0) + weight)
                }
                // Pick most popular label
                let bestLabel = labels.get(nodeId)!
                let bestWeight = -1
                for (const [label, w] of votes) {
                    if (w > bestWeight) { bestWeight = w; bestLabel = label }
                }
                if (bestLabel !== labels.get(nodeId)) {
                    labels.set(nodeId, bestLabel)
                    changed = true
                }
            }
            if (!changed) break
        }

        // Compact community IDs (0, 1, 2, ...)
        const uniqueLabels = [...new Set(labels.values())]
        const compactMap = new Map<number, number>()
        uniqueLabels.forEach((l, i) => compactMap.set(l, i))
        const result = new Map<string, number>()
        for (const [nodeId, label] of labels) {
            result.set(nodeId, compactMap.get(label)!)
        }
        return result
    }, [showCommunities, graphEdges, graphNodes])

    return (
        <div className={cn(
            "h-full flex flex-col overflow-hidden",
            isFullscreen && "fixed inset-0 z-50 bg-background"
        )}>
            {/* Header */}
            <div className="shrink-0 p-6 pb-3">
                <div className="max-w-7xl mx-auto">
                    <p className="text-xs text-muted-foreground mb-1">
                        {t('graph.contextLine').replace('{project}', selectedProject?.name ?? '—')}
                    </p>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
                                <Network className="h-5 w-5 text-purple-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold">{t('graph.title')}</h1>
                                <p className="text-sm text-muted-foreground">
                                    {graphView
                                        ? `${graphNodes.length} ${t('graph.nodes')} · ${graphEdges.length} ${t('graph.edges')}`
                                        : t('graph.loading')
                                    }
                                </p>
                            </div>
                        </div>

                            <div className="flex items-center gap-2">
                                {/* Path-finding toggle */}
                                <Button
                                    variant={pathMode ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => {
                                        setPathMode(!pathMode)
                                        setPathStart(null)
                                        setPathEnd(null)
                                    }}
                                    className="h-8 gap-1.5 text-xs"
                                >
                                    <Route className="h-3.5 w-3.5" />
                                    {t('graph.pathfinding')}
                                </Button>
                                <Button
                                    variant={showCommunities ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setShowCommunities(!showCommunities)}
                                    className="h-8 gap-1.5 text-xs"
                                >
                                    <Palette className="h-3.5 w-3.5" />
                                    {t('graph.communities')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={toggleFullscreen}
                                    className="h-8 gap-1.5 text-xs"
                                >
                                    {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                                    {isFullscreen ? t('graph.exitFullscreen') : t('graph.fullscreen')}
                                </Button>
                            </div>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Type filters */}
                        <Button
                            variant={!activeType ? "default" : "outline"}
                            size="sm"
                            onClick={() => setActiveType(null)}
                            className="h-7 text-xs"
                        >
                            {t('graph.allTypes')}
                        </Button>
                        {(Object.keys(ENTITY_TYPES) as EntityType[]).map(type => {
                            const config = ENTITY_TYPES[type]
                            const Icon = config.icon
                            return (
                                <Button
                                    key={type}
                                    variant={activeType === type ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setActiveType(activeType === type ? null : type)}
                                    className={cn("h-7 text-xs gap-1", activeType !== type && config.color)}
                                >
                                    <Icon className="h-3 w-3" />
                                    {getEntityLabel(type, t)}
                                </Button>
                            )
                        })}

                        <div className="w-px h-5 bg-border mx-1" />

                        {/* Node limit */}
                        <div className="flex items-center gap-1.5">
                            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{t('graph.nodes')}:</span>
                            {[30, 60, 100, 150].map(n => (
                                <Button
                                    key={n}
                                    variant={nodeLimit === n ? "default" : "ghost"}
                                    size="sm"
                                    onClick={() => setNodeLimit(n)}
                                    className="h-6 px-2 text-[11px]"
                                >
                                    {n}
                                </Button>
                            ))}
                        </div>

                        <div className="w-px h-5 bg-border mx-1" />

                        {/* Min mentions */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{t('graph.minMentions')}:</span>
                            {[1, 2, 5, 10].map(n => (
                                <Button
                                    key={n}
                                    variant={minCount === n ? "default" : "ghost"}
                                    size="sm"
                                    onClick={() => setMinCount(n)}
                                    className="h-6 px-2 text-[11px]"
                                >
                                    {n}+
                                </Button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Path-finding panel */}
                {pathMode && (
                    <div className="flex items-center gap-3 mt-3 p-2.5 bg-primary/5 border border-primary/20 rounded-lg">
                        <Route className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex items-center gap-2 text-xs flex-1">
                            <Badge variant={pathStart ? 'default' : 'outline'} className="text-xs">
                                {pathStart ? getNodeName(pathStart) : t('graph.selectStart')}
                            </Badge>
                            <span className="text-muted-foreground">→</span>
                            <Badge variant={pathEnd ? 'default' : 'outline'} className="text-xs">
                                {pathEnd ? getNodeName(pathEnd) : t('graph.selectEnd')}
                            </Badge>
                            {shortestPath && shortestPath.length > 0 && (
                                <span className="text-primary font-medium ml-2">
                                    {t('graph.pathSteps').replace('{n}', String(shortestPath.length - 1))}
                                </span>
                            )}
                            {shortestPath && shortestPath.length === 0 && pathStart && pathEnd && (
                                <span className="text-red-500 text-xs ml-2">
                                    {t('graph.noPathFound')}
                                </span>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => { setPathStart(null); setPathEnd(null) }}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                )}

                {graphView?.reduced && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                            Mode allégé activé: {graphView.originalNodes}→{graphNodes.length} nœuds, {graphView.originalEdges}→{graphEdges.length} liens.
                        </span>
                    </div>
                )}
            </div>

            {/* Graph Area */}
            <div ref={containerRef} className="flex-1 px-6 pb-6 overflow-hidden">
                <div className="max-w-7xl mx-auto h-full">
                    {isLoading ? (
                        <GraphSkeleton />
                    ) : error ? (
                        <Card className="h-full flex items-center justify-center">
                            <div className="text-center p-6">
                                <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
                                <p className="text-sm text-red-400 font-medium mb-1">{t('graph.loadError')}</p>
                                <p className="text-xs text-muted-foreground mb-4">{error}</p>
                                <div className="flex items-center justify-center gap-2">
                                    <Button variant="outline" size="sm" onClick={fetchGraph} className="gap-1.5">
                                        <RefreshCw className="h-3.5 w-3.5" />
                                        {t('common.retry')}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs"
                                        onClick={() => {
                                            setNodeLimit(30)
                                            setMinCount((prev) => Math.max(prev, 2))
                                        }}
                                    >
                                        Mode léger
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ) : graphView && graphNodes.length > 0 ? (
                        <RelationshipGraph
                            nodes={graphNodes}
                            edges={graphEdges}
                            width={dimensions.width}
                            height={dimensions.height}
                            onNodeClick={handleNodeClick}
                            communities={showCommunities ? communities : undefined}
                        />
                    ) : (
                        <Card className="h-full flex items-center justify-center">
                            <div className="text-center text-muted-foreground p-6">
                                <Network className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                <p className="text-sm font-medium">{t('graph.noData')}</p>
                                <p className="text-xs mt-1">
                                    {t('graph.noDataHint')}
                                </p>
                            </div>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}
