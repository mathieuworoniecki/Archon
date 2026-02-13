import { useState, useRef, useCallback } from 'react'
import { FileText, Image, FileCode, File, Database, Brain, ChevronRight, Archive } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SearchResult } from '@/lib/api'
import { cn } from '@/lib/utils'
import { FavoriteButton } from '@/components/favorites/FavoriteButton'

interface ResultCardProps {
    result: SearchResult
    isSelected: boolean
    onClick: () => void
    className?: string
}

export function ResultCard({ result, isSelected, onClick, className }: ResultCardProps) {
    const [showPreview, setShowPreview] = useState(false)
    const [previewPos, setPreviewPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'pdf':
                return <FileText className="h-5 w-5 text-red-400" />
            case 'image':
                return <Image className="h-5 w-5 text-blue-400" />
            case 'text':
                return <FileCode className="h-5 w-5 text-green-400" />
            default:
                return <File className="h-5 w-5 text-muted-foreground" />
        }
    }

    const isImage = result.file_type === 'image'

    const handleMouseEnter = useCallback((e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setPreviewPos({ x: rect.right + 12, y: rect.top })
        timeoutRef.current = setTimeout(() => setShowPreview(true), 350)
    }, [])

    const handleMouseLeave = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setShowPreview(false)
    }, [])

    return (
        <Card
            className={cn(
                'group p-4 cursor-pointer transition-all hover:border-primary/50 relative',
                isSelected && 'border-primary bg-primary/5 ring-1 ring-primary',
                className
            )}
            onClick={onClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="space-y-2">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {/* Inline thumbnail for visual types */}
                        {(result.file_type === 'image' || result.file_type === 'pdf') ? (
                            <div className="w-10 h-10 rounded-md overflow-hidden bg-muted/30 border border-border/50 shrink-0">
                                <img
                                    src={`/api/documents/${result.document_id}/thumbnail`}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                        const el = e.target as HTMLImageElement
                                        el.style.display = 'none'
                                        // Show fallback icon
                                        const parent = el.parentElement
                                        if (parent) {
                                            parent.classList.add('flex', 'items-center', 'justify-center')
                                            // Parent already has the icon from getFileIcon as the component re-renders
                                        }
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="w-10 h-10 rounded-md bg-muted/20 border border-border/30 flex items-center justify-center shrink-0">
                                {getFileIcon(result.file_type)}
                            </div>
                        )}
                        <span className="font-medium truncate text-sm">{result.file_name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <FavoriteButton 
                            documentId={result.document_id} 
                            size="sm" 
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0"
                        />
                        <ChevronRight className={cn(
                            'h-4 w-4 text-muted-foreground transition-transform',
                            isSelected && 'text-primary rotate-90'
                        )} />
                    </div>
                </div>

                {/* Snippet with highlighting */}
                {result.snippet && (
                    <div
                        className="text-sm text-muted-foreground line-clamp-3"
                        dangerouslySetInnerHTML={{ __html: result.snippet }}
                    />
                )}

                {/* Footer with badges */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                        {result.file_type.toUpperCase()}
                    </Badge>

                    {/* Archive indicator */}
                    {result.archive_path && (
                        <Badge variant="outline" className="text-xs gap-1 text-orange-400 border-orange-400/50">
                            <Archive className="h-3 w-3" />
                            {result.archive_path.split('/')[0]}
                        </Badge>
                    )}

                    {/* Source indicators */}
                    {result.from_meilisearch && (
                        <Badge variant="secondary" className="text-xs gap-1">
                            <Database className="h-3 w-3" />
                            #{result.meilisearch_rank}
                        </Badge>
                    )}
                    {result.from_qdrant && (
                        <Badge variant="secondary" className="text-xs gap-1">
                            <Brain className="h-3 w-3" />
                            #{result.qdrant_rank}
                        </Badge>
                    )}

                    {/* Score — visual relevance bar */}
                    <div className="flex items-center gap-1.5 ml-auto" title={`Score: ${(result.score * 100).toFixed(1)}%`}>
                        <div className="w-16 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                    width: `${Math.min(result.score * 100, 100)}%`,
                                    backgroundColor: result.score >= 0.7
                                        ? `hsl(${Math.round(120 * ((result.score - 0.7) / 0.3))}, 65%, 45%)`
                                        : result.score >= 0.4
                                            ? `hsl(${Math.round(40 * ((result.score - 0.4) / 0.3))}, 70%, 50%)`
                                            : 'hsl(0, 65%, 50%)',
                                }}
                            />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
                            {(result.score * 100).toFixed(0)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Hover Preview Tooltip */}
            {showPreview && (
                <div
                    className="fixed z-50 pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150"
                    style={{
                        left: Math.min(previewPos.x, window.innerWidth - 320),
                        top: Math.min(previewPos.y, window.innerHeight - 260),
                    }}
                >
                    <div className="w-72 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(22,27,34,0.95)] backdrop-blur-xl shadow-2xl overflow-hidden">
                        {isImage ? (
                            <div className="p-2">
                                <img
                                    src={`/api/documents/${result.document_id}/thumbnail`}
                                    alt={result.file_name}
                                    className="w-full h-40 object-cover rounded-lg bg-muted"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none'
                                    }}
                                />
                                <div className="mt-2 px-1 text-xs text-muted-foreground truncate">
                                    {result.file_name}
                                </div>
                            </div>
                        ) : (
                            <div className="p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    {getFileIcon(result.file_type)}
                                    <span className="text-sm font-medium truncate">{result.file_name}</span>
                                </div>
                                {result.snippet && (
                                    <div
                                        className="text-xs text-muted-foreground line-clamp-6 leading-relaxed"
                                        dangerouslySetInnerHTML={{ __html: result.snippet }}
                                    />
                                )}
                                <div className="text-[10px] text-muted-foreground/60 truncate">
                                    {result.file_path}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Card>
    )
}
