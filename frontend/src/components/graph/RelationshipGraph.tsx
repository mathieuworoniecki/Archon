import { useRef, useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────

interface GraphNode extends d3.SimulationNodeDatum {
    id: string
    text: string
    type: string
    total_count: number
    document_count: number
}

interface GraphEdge {
    source: string | GraphNode
    target: string | GraphNode
    weight: number
}

interface RelationshipGraphProps {
    nodes: GraphNode[]
    edges: GraphEdge[]
    width?: number
    height?: number
    onNodeClick?: (node: GraphNode) => void
    className?: string
    communities?: Map<string, number>
}

// ── Color Palette per entity type ─────────────────────

const TYPE_COLORS: Record<string, string> = {
    PER: '#60a5fa',   // blue-400
    ORG: '#34d399',   // emerald-400
    LOC: '#fbbf24',   // amber-400
    MISC: '#a78bfa',  // purple-400
    DATE: '#f472b6',  // pink-400
}

const TYPE_LABELS: Record<string, string> = {
    PER: 'Personnes',
    ORG: 'Organisations',
    LOC: 'Lieux',
    MISC: 'Divers',
    DATE: 'Dates',
}

// Community color palette (10 distinct colors)
const COMMUNITY_COLORS = [
    '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6',
    '#fb923c', '#2dd4bf', '#e879f9', '#a3e635', '#f87171',
]

// ── Component ─────────────────────────────────────────

export function RelationshipGraph({
    nodes,
    edges,
    width = 900,
    height = 600,
    onNodeClick,
    className,
    communities,
}: RelationshipGraphProps) {
    const svgRef = useRef<SVGSVGElement>(null)
    const [hoveredNode, setHoveredNode] = useState<string | null>(null)

    // Color function: community-aware or type-based
    const getNodeColor = useMemo(() => {
        if (communities && communities.size > 0) {
            return (nodeId: string) => {
                const communityId = communities.get(nodeId) ?? 0
                return COMMUNITY_COLORS[communityId % COMMUNITY_COLORS.length]
            }
        }
        return (_nodeId: string, nodeType: string) => TYPE_COLORS[nodeType] || '#888'
    }, [communities])

    // Compute radii based on total_count
    const radiusScale = useMemo(() => {
        const maxCount = Math.max(...nodes.map(n => n.total_count), 1)
        return d3.scaleSqrt().domain([1, maxCount]).range([6, 28])
    }, [nodes])

    // Edge width scale
    const edgeScale = useMemo(() => {
        const maxWeight = Math.max(...edges.map(e => e.weight), 1)
        return d3.scaleLinear().domain([1, maxWeight]).range([0.5, 4])
    }, [edges])

    useEffect(() => {
        if (!svgRef.current || nodes.length === 0) return

        const svg = d3.select(svgRef.current)
        svg.selectAll('*').remove()

        // Deep copy to avoid D3 mutation of original data
        const simNodes: GraphNode[] = nodes.map(n => ({ ...n }))
        const simEdges: GraphEdge[] = edges.map(e => ({ ...e }))

        // Container with zoom
        const g = svg.append('g')

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.2, 5])
            .on('zoom', (event) => {
                g.attr('transform', event.transform)
            })

        svg.call(zoom)

        // Force simulation
        const simulation = d3.forceSimulation<GraphNode>(simNodes)
            .force('link', d3.forceLink<GraphNode, d3.SimulationLinkDatum<GraphNode>>(simEdges as any)
                .id((d: any) => d.id)
                .distance(100)
                .strength((d: any) => Math.min(d.weight / 5, 0.8))
            )
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide<GraphNode>().radius(d => radiusScale(d.total_count) + 4))

        // Edges
        const link = g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(simEdges)
            .join('line')
            .attr('stroke', 'hsl(var(--muted-foreground) / 0.15)')
            .attr('stroke-width', (d: any) => edgeScale(d.weight))

        // Node groups
        const node = g.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(simNodes)
            .join('g')
            .attr('cursor', 'pointer')
            // @ts-expect-error - D3 Selection type incompatibility with .call()
            .call(d3.drag<SVGGElement, GraphNode>()
                .on('start', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0.3).restart()
                    d.fx = d.x
                    d.fy = d.y
                })
                .on('drag', (event, d) => {
                    d.fx = event.x
                    d.fy = event.y
                })
                .on('end', (event, d) => {
                    if (!event.active) simulation.alphaTarget(0)
                    d.fx = null
                    d.fy = null
                })
            )

        // Node circles
        node.append('circle')
            .attr('r', d => radiusScale(d.total_count))
            .attr('fill', d => getNodeColor(d.id, d.type))
            .attr('fill-opacity', 0.7)
            .attr('stroke', d => getNodeColor(d.id, d.type))
            .attr('stroke-width', 1.5)
            .attr('stroke-opacity', 0.9)

        // Glow effect on hover
        node.append('circle')
            .attr('r', d => radiusScale(d.total_count) + 4)
            .attr('fill', 'none')
            .attr('stroke', d => getNodeColor(d.id, d.type))
            .attr('stroke-width', 0)
            .attr('stroke-opacity', 0.4)
            .attr('class', 'glow-ring')

        // Labels — only show for larger nodes
        node.append('text')
            .text(d => d.text.length > 18 ? d.text.slice(0, 16) + '…' : d.text)
            .attr('font-size', d => Math.max(8, Math.min(12, radiusScale(d.total_count) * 0.7)))
            .attr('fill', 'hsl(var(--foreground) / 0.85)')
            .attr('text-anchor', 'middle')
            .attr('dy', d => radiusScale(d.total_count) + 14)
            .attr('font-family', 'ui-sans-serif, system-ui, sans-serif')
            .attr('pointer-events', 'none')

        // Interactions
        node
            .on('mouseover', function (_event, d) {
                setHoveredNode(d.id)
                d3.select(this).select('.glow-ring')
                    .transition().duration(200)
                    .attr('stroke-width', 3)
                
                // Highlight connected edges
                link
                    .attr('stroke', (l: any) => {
                        const s = typeof l.source === 'object' ? l.source.id : l.source
                        const t = typeof l.target === 'object' ? l.target.id : l.target
                        return (s === d.id || t === d.id) ? (getNodeColor(d.id, d.type)) : 'hsl(var(--muted-foreground) / 0.08)'
                    })
                    .attr('stroke-width', (l: any) => {
                        const s = typeof l.source === 'object' ? l.source.id : l.source
                        const t = typeof l.target === 'object' ? l.target.id : l.target
                        return (s === d.id || t === d.id) ? edgeScale(l.weight) * 2 : edgeScale(l.weight) * 0.3
                    })
            })
            .on('mouseout', function () {
                setHoveredNode(null)
                d3.select(this).select('.glow-ring')
                    .transition().duration(200)
                    .attr('stroke-width', 0)

                link
                    .attr('stroke', 'hsl(var(--muted-foreground) / 0.15)')
                    .attr('stroke-width', (d: any) => edgeScale(d.weight))
            })
            .on('click', (event, d) => {
                event.stopPropagation()
                onNodeClick?.(d)
            })

        // Tick
        simulation.on('tick', () => {
            link
                .attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y)

            node.attr('transform', d => `translate(${d.x},${d.y})`)
        })

        return () => {
            simulation.stop()
        }
    }, [nodes, edges, width, height, radiusScale, edgeScale, onNodeClick, getNodeColor])

    // Legend
    const activeTypes = useMemo(() => {
        const types = new Set(nodes.map(n => n.type))
        return Object.entries(TYPE_COLORS).filter(([t]) => types.has(t))
    }, [nodes])

    return (
        <div className={cn("relative", className)}>
            <svg
                ref={svgRef}
                width={width}
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                className="bg-muted/50 rounded-lg border"
            />

            {/* Legend */}
            <div className="absolute top-3 left-3 flex flex-col gap-1.5 bg-card/80 backdrop-blur-sm rounded-md px-3 py-2 border">
                {activeTypes.map(([type, color]) => (
                    <div key={type} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-muted-foreground">{TYPE_LABELS[type] || type}</span>
                    </div>
                ))}
            </div>

            {/* Hovered node info */}
            {hoveredNode && (() => {
                const n = nodes.find(n => n.id === hoveredNode)
                if (!n) return null
                return (
                    <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-sm rounded-md px-3 py-2 border text-xs">
                        <p className="font-medium">{n.text}</p>
                        <p className="text-muted-foreground">
                            {n.total_count} mentions · {n.document_count} doc{n.document_count > 1 ? 's' : ''}
                        </p>
                    </div>
                )
            })()}
        </div>
    )
}
