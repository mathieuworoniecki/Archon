import { useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { useTimeline, TimelineDataPoint } from '@/hooks/useTimeline'
import { cn } from '@/lib/utils'

interface TimelineHeatmapProps {
    granularity?: 'day' | 'week' | 'month' | 'year'
    onDateSelect?: (date: string) => void
    className?: string
}

// Color intensity based on document count
function getIntensityColor(count: number, maxCount: number): string {
    if (count === 0) return 'bg-muted/30'
    
    const ratio = count / maxCount
    if (ratio < 0.25) return 'bg-primary/20'
    if (ratio < 0.5) return 'bg-primary/40'
    if (ratio < 0.75) return 'bg-primary/60'
    return 'bg-primary/90'
}

// Format date label based on granularity
function formatDateLabel(date: string, granularity: string): string {
    if (granularity === 'year') return date
    if (granularity === 'month') {
        const [year, month] = date.split('-')
        const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']
        return `${months[parseInt(month) - 1]} ${year}`
    }
    if (granularity === 'week') {
        return date // "2024-W01" format
    }
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Format tooltip text
function getTooltipText(point: TimelineDataPoint, granularity: string): string {
    const label = formatDateLabel(point.date, granularity)
    const typeInfo = Object.entries(point.by_type)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ')
    return `${label}\n${point.count} documents\n${typeInfo}`
}

export function TimelineHeatmap({ 
    granularity = 'month', 
    onDateSelect,
    className 
}: TimelineHeatmapProps) {
    const { data, isLoading, error } = useTimeline({ granularity })

    const maxCount = useMemo(() => {
        if (!data?.data.length) return 1
        return Math.max(...data.data.map(d => d.count))
    }, [data])

    if (isLoading) {
        return (
            <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
                <Calendar className="h-4 w-4 animate-pulse" />
                <span className="text-sm">Chargement timeline...</span>
            </div>
        )
    }

    if (error || !data?.data.length) {
        return null // Don't show if no data
    }

    return (
        <div className={cn("space-y-2", className)}>
            {/* Header */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Timeline ({data.total_documents} documents)</span>
            </div>

            {/* Heatmap Grid */}
            <div className="flex flex-wrap gap-1">
                {data.data.map((point) => (
                    <button
                        key={point.date}
                        title={getTooltipText(point, granularity)}
                        onClick={() => onDateSelect?.(point.date)}
                        className={cn(
                            "w-6 h-6 rounded-sm transition-all hover:ring-2 hover:ring-primary/50",
                            getIntensityColor(point.count, maxCount),
                            onDateSelect && "cursor-pointer"
                        )}
                    />
                ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Moins</span>
                <div className="flex gap-1">
                    <div className="w-3 h-3 rounded-sm bg-muted/30" />
                    <div className="w-3 h-3 rounded-sm bg-primary/20" />
                    <div className="w-3 h-3 rounded-sm bg-primary/40" />
                    <div className="w-3 h-3 rounded-sm bg-primary/60" />
                    <div className="w-3 h-3 rounded-sm bg-primary/90" />
                </div>
                <span>Plus</span>
            </div>
        </div>
    )
}
