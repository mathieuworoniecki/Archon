import { FileText, Image, FileCode, File, Database, Brain, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SearchResult } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ResultCardProps {
    result: SearchResult
    isSelected: boolean
    onClick: () => void
}

export function ResultCard({ result, isSelected, onClick }: ResultCardProps) {
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

    return (
        <Card
            className={cn(
                'p-4 cursor-pointer transition-all hover:border-primary/50',
                isSelected && 'border-primary bg-primary/5 ring-1 ring-primary'
            )}
            onClick={onClick}
        >
            <div className="space-y-2">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        {getFileIcon(result.file_type)}
                        <span className="font-medium truncate">{result.file_name}</span>
                    </div>
                    <ChevronRight className={cn(
                        'h-4 w-4 text-muted-foreground shrink-0 transition-transform',
                        isSelected && 'text-primary rotate-90'
                    )} />
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

                    {/* Score */}
                    <span className="text-xs text-muted-foreground ml-auto">
                        Score: {(result.score * 100).toFixed(1)}%
                    </span>
                </div>
            </div>
        </Card>
    )
}
