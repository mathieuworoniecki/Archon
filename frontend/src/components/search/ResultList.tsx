import { SearchResult } from '@/lib/api'
import { ResultCard } from './ResultCard'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileSearch, Clock } from 'lucide-react'

interface ResultListProps {
    results: SearchResult[]
    selectedId: number | null
    onSelect: (result: SearchResult) => void
    totalResults: number
    processingTime: number
    isLoading: boolean
}

export function ResultList({
    results,
    selectedId,
    onSelect,
    totalResults,
    processingTime,
    isLoading
}: ResultListProps) {
    if (isLoading) {
        return (
            <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-lg border p-4 space-y-2">
                        <div className="h-4 w-1/3 shimmer rounded" />
                        <div className="h-3 w-full shimmer rounded" />
                        <div className="h-3 w-2/3 shimmer rounded" />
                    </div>
                ))}
            </div>
        )
    }

    if (results.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                <FileSearch className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Aucun résultat</p>
                <p className="text-sm">Lancez une recherche pour voir les résultats</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            {/* Stats bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b text-sm text-muted-foreground">
                <span>{totalResults} résultat{totalResults > 1 ? 's' : ''}</span>
                <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {processingTime.toFixed(0)}ms
                </span>
            </div>

            {/* Results */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                    {results.map((result) => (
                        <ResultCard
                            key={result.document_id}
                            result={result}
                            isSelected={selectedId === result.document_id}
                            onClick={() => onSelect(result)}
                        />
                    ))}
                </div>
            </ScrollArea>
        </div>
    )
}
