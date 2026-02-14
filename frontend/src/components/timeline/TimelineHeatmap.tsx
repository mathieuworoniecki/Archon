import { useMemo } from 'react'
import { Calendar, RefreshCw } from 'lucide-react'
import { useTimeline, TimelineDataPoint } from '@/hooks/useTimeline'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/contexts/I18nContext'
import { Button } from '@/components/ui/button'

interface TimelineHeatmapProps {
    granularity?: 'day' | 'week' | 'month' | 'year'
    onDateSelect?: (date: string) => void
    dateFrom?: string
    dateTo?: string
    selectedDate?: string | null
    dataPoints?: TimelineDataPoint[]
    totalDocuments?: number
    isLoading?: boolean
    error?: string | null
    onRetry?: () => void
    className?: string
}

// Color intensity based on document count
function getIntensityColor(count: number, maxCount: number): string {
    if (count === 0) return 'bg-muted/30'
    
    const ratio = count / maxCount
    if (ratio < 0.25) return 'bg-primary/30'
    if (ratio < 0.5) return 'bg-primary/50'
    if (ratio < 0.75) return 'bg-primary/70'
    return 'bg-primary'
}

// Format date label based on granularity
function formatDateLabel(date: string, granularity: string): string {
    if (granularity === 'year') return date
    if (granularity === 'month') {
        const [year, month] = date.split('-')
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return `${months[parseInt(month) - 1]} ${year.slice(2)}`
    }
    if (granularity === 'week') {
        return date
    }
    return new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// Format tooltip text
function getTooltipText(point: TimelineDataPoint, granularity: string): string {
    const label = formatDateLabel(point.date, granularity)
    const typeInfo = Object.entries(point.by_type)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ')
    return `${label}\n${point.count.toLocaleString()} documents\n${typeInfo}`
}

export function TimelineHeatmap({ 
    granularity = 'month', 
    onDateSelect,
    dateFrom,
    dateTo,
    selectedDate,
    dataPoints,
    totalDocuments,
    isLoading: isLoadingOverride,
    error: errorOverride,
    onRetry,
    className 
}: TimelineHeatmapProps) {
    const shouldUseInternalQuery = typeof dataPoints === 'undefined'
    const timelineQuery = useTimeline({ granularity, enabled: shouldUseInternalQuery })
    const { t } = useTranslation()
    const sourceData = shouldUseInternalQuery ? (timelineQuery.data?.data ?? []) : dataPoints
    const sourceTotalDocuments = shouldUseInternalQuery
        ? (timelineQuery.data?.total_documents ?? 0)
        : (totalDocuments ?? sourceData?.reduce((acc, item) => acc + item.count, 0) ?? 0)
    const isLoading = typeof isLoadingOverride === 'boolean'
        ? isLoadingOverride
        : (shouldUseInternalQuery ? timelineQuery.isLoading : false)
    const error = typeof errorOverride === 'string'
        ? errorOverride
        : (shouldUseInternalQuery ? timelineQuery.error : null)

    // Filter data based on date range (for drill-down zoom)
    const displayData = useMemo(() => {
        if (!sourceData?.length) return []
        if (!dateFrom && !dateTo) return sourceData
        return sourceData.filter(point => {
            if (dateFrom && point.date < dateFrom) return false
            if (dateTo && point.date > dateTo) return false
            return true
        })
    }, [dateFrom, dateTo, sourceData])

    const maxCount = useMemo(() => {
        if (!displayData.length) return 1
        return Math.max(...displayData.map(d => d.count))
    }, [displayData])

    if (isLoading) {
        return (
            <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
                <Calendar className="h-4 w-4 animate-pulse" />
                <span className="text-sm">{t('common.loading')}</span>
            </div>
        )
    }

    if (error) {
        return (
            <div className={cn("flex flex-col items-center justify-center gap-2 text-center text-red-500 p-4", className)}>
                <p className="text-sm">{t('timeline.error')}: {error}</p>
                {onRetry && (
                    <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />
                        {t('common.retry')}
                    </Button>
                )}
            </div>
        )
    }

    if (!displayData.length) {
        return null
    }

    return (
        <div className={cn("space-y-3", className)}>
            {/* Header */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{t('timelineHeatmap.header').replace('{count}', sourceTotalDocuments.toLocaleString())}</span>
            </div>

            {/* Bar Chart View — much more visually impactful than tiny sparse squares */}
            <div className="relative flex h-40 items-end gap-1 overflow-x-auto pb-6 pt-2">
                {displayData.map((point) => {
                    const heightPct = maxCount > 0 ? Math.max((point.count / maxCount) * 100, 2) : 2
                    return (
                        <div
                            key={point.date}
                            className="group relative flex h-full flex-shrink-0 flex-col items-center justify-end"
                            style={{ minWidth: displayData.length > 24 ? '16px' : '28px' }}
                        >
                            <button
                                title={getTooltipText(point, granularity)}
                                onClick={() => onDateSelect?.(point.date)}
                                className={cn(
                                    "w-full rounded-t-sm transition-all hover:ring-2 hover:ring-primary/50",
                                    selectedDate === point.date && "ring-2 ring-primary",
                                    getIntensityColor(point.count, maxCount),
                                    onDateSelect && "cursor-pointer"
                                )}
                                style={{ height: `${Math.max(heightPct, 4)}%` }}
                            />
                            {/* Label — show on hover when too many bars */}
                            <span className={cn(
                                "absolute bottom-0 mt-1 whitespace-nowrap text-[9px] text-muted-foreground",
                                displayData.length > 36 ? "hidden group-hover:block" : ""
                            )}>
                                {formatDateLabel(point.date, granularity)}
                            </span>
                        </div>
                    )
                })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{t('timeline.less')}</span>
                <div className="flex gap-1">
                    <div className="w-3 h-3 rounded-sm bg-muted/30" />
                    <div className="w-3 h-3 rounded-sm bg-primary/30" />
                    <div className="w-3 h-3 rounded-sm bg-primary/50" />
                    <div className="w-3 h-3 rounded-sm bg-primary/70" />
                    <div className="w-3 h-3 rounded-sm bg-primary" />
                </div>
                <span>{t('timeline.more')}</span>
            </div>
        </div>
    )
}
