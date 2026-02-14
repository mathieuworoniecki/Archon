import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Calendar, Clock, FileText, Activity, ArrowRight, ChevronsRight, FolderOpen, ZoomOut, ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TimelineHeatmap } from '@/components/timeline/TimelineHeatmap'
import { useTimeline } from '@/hooks/useTimeline'
import { useTranslation } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'
import { TimelineSkeleton } from '@/components/ui/skeleton'

type Granularity = 'year' | 'month' | 'day'

interface ZoomLevel {
    granularity: Granularity
    label: string       // e.g. "2020" or "Mar 2020"
    dateFrom?: string   // filter start
    dateTo?: string     // filter end
}

const GRANULARITY_ORDER: Granularity[] = ['year', 'month', 'day']

function formatDate(isoDate: string | null | undefined): string {
    if (!isoDate) return '-'
    try {
        const d = new Date(isoDate)
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
        return isoDate
    }
}

export function TimelinePage() {
    const [zoomStack, setZoomStack] = useState<ZoomLevel[]>([])
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [activeDecade, setActiveDecade] = useState<number | null>(null)
    const { t } = useTranslation()
    const navigate = useNavigate()

    // Current zoom level determines the granularity
    const currentZoom = zoomStack.length > 0 ? zoomStack[zoomStack.length - 1] : null
    const currentGranularity: Granularity = currentZoom?.granularity || 'year'

    const { data, range, isLoading, error, refetch } = useTimeline({ granularity: currentGranularity })

    // Use a single source of truth for total documents
    const totalDocuments = data?.total_documents || range?.total_documents || 0

    // Compute decades present in the data
    const decades = useMemo(() => {
        if (!range?.min_date || !range?.max_date) return []
        const startYear = new Date(range.min_date).getFullYear()
        const endYear = new Date(range.max_date).getFullYear()
        const startDecade = Math.floor(startYear / 10) * 10
        const endDecade = Math.floor(endYear / 10) * 10
        const result: number[] = []
        for (let d = startDecade; d <= endDecade; d += 10) {
            result.push(d)
        }
        return result
    }, [range])

    // Compute document count per decade
    const decadeCounts = useMemo(() => {
        if (!data?.data) return {} as Record<number, number>
        const counts: Record<number, number> = {}
        data.data.forEach(point => {
            const year = parseInt(point.date.split('-')[0])
            const decade = Math.floor(year / 10) * 10
            counts[decade] = (counts[decade] || 0) + point.count
        })
        return counts
    }, [data])

    // Can drill down?
    const canZoomIn = GRANULARITY_ORDER.indexOf(currentGranularity) < GRANULARITY_ORDER.length - 1
    const canZoomOut = zoomStack.length > 0

    // Keep decade pin only at year-level; drilling into month/day clears it.
    useEffect(() => {
        if (currentGranularity !== 'year' && activeDecade !== null) {
            setActiveDecade(null)
        }
    }, [activeDecade, currentGranularity])

    // Handle bar click → drill down
    const handleDateClick = useCallback((date: string) => {
        if (canZoomIn) {
            const nextIdx = GRANULARITY_ORDER.indexOf(currentGranularity) + 1
            const nextGranularity = GRANULARITY_ORDER[nextIdx]
            
            let dateFrom: string
            let dateTo: string
            let label: string

            if (currentGranularity === 'year') {
                // Clicked a year → drill into months of that year
                const year = date.split('-')[0]
                dateFrom = `${year}-01`
                dateTo = `${year}-12`
                label = year
            } else if (currentGranularity === 'month') {
                // Clicked a month → drill into days of that month
                const [year, month] = date.split('-')
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
                dateFrom = `${year}-${month}-01`
                dateTo = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
                label = `${months[parseInt(month) - 1]} ${year}`
            } else {
                // Day level → select for analysis
                setSelectedDate(date)
                return
            }

            setZoomStack(prev => [...prev, { granularity: nextGranularity, label, dateFrom, dateTo }])
            setSelectedDate(null)
        } else {
            // At day level, just select
            setSelectedDate(date)
        }
    }, [canZoomIn, currentGranularity])

    // Zoom out one level
    const handleZoomOut = useCallback(() => {
        setZoomStack(prev => prev.slice(0, -1))
        setSelectedDate(null)
    }, [])

    // Jump to specific breadcrumb level
    const handleBreadcrumbClick = useCallback((index: number) => {
        if (index < 0) {
            setZoomStack([])
        } else {
            setZoomStack(prev => prev.slice(0, index + 1))
        }
        setSelectedDate(null)
    }, [])

    const handleDecadeClick = useCallback((decade: number) => {
        setZoomStack([])
        setSelectedDate(null)
        setActiveDecade((prev) => (prev === decade ? null : decade))
    }, [])

    const handleGoToAnalysis = () => {
        if (selectedDate) {
            navigate(`/cockpit?date=${encodeURIComponent(selectedDate)}`)
        }
    }

    const decadeDateFrom = useMemo(() => {
        if (currentGranularity !== 'year' || activeDecade === null) return undefined
        return `${activeDecade}-01`
    }, [activeDecade, currentGranularity])

    const decadeDateTo = useMemo(() => {
        if (currentGranularity !== 'year' || activeDecade === null) return undefined
        return `${activeDecade + 9}-12`
    }, [activeDecade, currentGranularity])

    const effectiveDateFrom = currentZoom?.dateFrom ?? decadeDateFrom
    const effectiveDateTo = currentZoom?.dateTo ?? decadeDateTo

    return (
        <div className="h-full p-6 overflow-auto">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Calendar className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">{t('timeline.title')}</h1>
                        <p className="text-muted-foreground">
                            {t('timeline.subtitle')}
                        </p>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <FileText className="h-8 w-8 text-blue-500" />
                                <div>
                                    <p className="text-2xl font-bold">{totalDocuments.toLocaleString()}</p>
                                    <p className="text-sm text-muted-foreground">{t('timeline.documents')}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <Calendar className="h-8 w-8 text-green-500" />
                                <div>
                                    <p className="text-2xl font-bold">{data?.data?.length || 0}</p>
                                    <p className="text-sm text-muted-foreground">{t('timeline.activePeriods')}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <Clock className="h-8 w-8 text-orange-500" />
                                <div>
                                    <p className="text-sm font-bold truncate">{formatDate(range?.min_date)}</p>
                                    <p className="text-sm text-muted-foreground">{t('timeline.start')}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <Activity className="h-8 w-8 text-purple-500" />
                                <div>
                                    <p className="text-sm font-bold truncate">{formatDate(range?.max_date)}</p>
                                    <p className="text-sm text-muted-foreground">{t('timeline.end')}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Zoom Breadcrumb + Controls */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5 text-sm">
                        {/* Root level */}
                        <button
                            onClick={() => handleBreadcrumbClick(-1)}
                            className={cn(
                                "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                                zoomStack.length === 0
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            )}
                        >
                            {t('timeline.allYears')}
                        </button>

                        {/* Zoom levels */}
                        {zoomStack.map((level, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                                <button
                                    onClick={() => handleBreadcrumbClick(i)}
                                    className={cn(
                                        "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                                        i === zoomStack.length - 1
                                            ? "bg-primary/15 text-primary"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                    )}
                                >
                                    {level.label}
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Zoom buttons */}
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={!canZoomOut}
                            onClick={handleZoomOut}
                            title={t('timeline.zoomOut')}
                        >
                            <ZoomOut className="h-3.5 w-3.5" />
                        </Button>
                        <span className="text-[10px] text-muted-foreground w-14 text-center font-medium uppercase">
                            {currentGranularity === 'year' ? t('timeline.byYear') : currentGranularity === 'month' ? t('timeline.byMonth') : t('timeline.byDay')}
                        </span>
                    </div>
                </div>

                {/* Decade Jumpers — only at year level */}
                {currentGranularity === 'year' && decades.length > 1 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <ChevronsRight className="h-3.5 w-3.5" />
                            {t('timeline.decades')}
                        </span>
                        {decades.map(decade => {
                            const count = decadeCounts[decade] || 0
                            const isActive = activeDecade === decade
                            return (
                                <Button
                                    key={decade}
                                    variant={isActive ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => handleDecadeClick(decade)}
                                    className={cn("h-7 text-xs gap-1", isActive && "ring-2 ring-primary/30")}
                                >
                                    {decade}s
                                    {count > 0 && (
                                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] ml-1">
                                            {count.toLocaleString()}
                                        </Badge>
                                    )}
                                </Button>
                            )
                        })}
                    </div>
                )}

                {/* Empty state: no documents yet */}
                {!isLoading && !error && totalDocuments === 0 && (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <FolderOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
                            <h3 className="text-lg font-semibold mb-1">{t('timeline.emptyTitle')}</h3>
                            <p className="text-sm text-muted-foreground max-w-md mb-6">{t('timeline.emptyDescription')}</p>
                            <Button asChild variant="default">
                                <Link to="/scans">{t('timeline.goToScans')}</Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Heatmap */}
                {(!isLoading && !error && totalDocuments === 0) ? null : (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            {t('timeline.heatmap')}
                            {canZoomIn && (
                                <span className="text-xs font-normal text-muted-foreground">
                                    — {t('timeline.clickToZoom')}
                                </span>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading && (
                            <div className="h-48 mb-3"><TimelineSkeleton /></div>
                        )}
                        <TimelineHeatmap 
                            granularity={currentGranularity}
                            dataPoints={data?.data}
                            totalDocuments={totalDocuments}
                            isLoading={isLoading}
                            error={error}
                            onRetry={refetch}
                            onDateSelect={handleDateClick}
                            dateFrom={effectiveDateFrom}
                            dateTo={effectiveDateTo}
                        />
                    </CardContent>
                </Card>
                )}

                {/* Selected Date Details */}
                {selectedDate && (
                    <Card className="border-primary/50">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>{t('timeline.documentsOf')} {selectedDate}</span>
                                <Button size="sm" onClick={handleGoToAnalysis} className="gap-1.5">
                                    {t('timeline.openInCockpit')}
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground text-sm">
                                {t('timeline.cockpitHint')}
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
