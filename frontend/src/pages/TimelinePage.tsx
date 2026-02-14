import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
    Calendar,
    Clock,
    FileText,
    Activity,
    ChevronsRight,
    FolderOpen,
    ZoomOut,
    ChevronRight,
    Flame,
    AlertTriangle,
    Filter,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    Eye,
    Search,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TimelineHeatmap } from '@/components/timeline/TimelineHeatmap'
import { useTimeline } from '@/hooks/useTimeline'
import { useTranslation } from '@/contexts/I18nContext'
import { useProject } from '@/contexts/ProjectContext'
import { cn } from '@/lib/utils'
import { TimelineSkeleton } from '@/components/ui/skeleton'
import { getDocuments } from '@/lib/api/documents'
import type { Document, FileType } from '@/lib/api/types'
import { formatNumber } from '@/lib/formatters'

type Granularity = 'year' | 'month' | 'day'

interface ZoomLevel {
    granularity: Granularity
    label: string
    dateFrom?: string
    dateTo?: string
}

interface PeriodRange {
    from: string
    to: string
}

const GRANULARITY_ORDER: Granularity[] = ['year', 'month', 'day']

function formatDate(isoDate: string | null | undefined, locale: string): string {
    if (!isoDate) return '-'
    try {
        const d = new Date(isoDate)
        return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        })
    } catch {
        return isoDate
    }
}

function formatPeriodLabel(period: string, granularity: Granularity, locale: string): string {
    if (granularity === 'year') return period
    if (granularity === 'month') {
        const [year, month] = period.split('-')
        const d = new Date(Number(year), Number(month) - 1, 1)
        return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
            year: 'numeric',
            month: 'short',
        })
    }
    if (granularity === 'day') {
        return formatDate(period, locale)
    }
    return period
}

function isoWeekStart(year: number, week: number): Date {
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7))
    const dayOfWeek = simple.getUTCDay()
    const isoStart = new Date(simple)
    if (dayOfWeek <= 4) {
        isoStart.setUTCDate(simple.getUTCDate() - dayOfWeek + 1)
    } else {
        isoStart.setUTCDate(simple.getUTCDate() + 8 - dayOfWeek)
    }
    return isoStart
}

function formatDateOnlyUTC(value: Date): string {
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, '0')
    const day = String(value.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function getPeriodRange(period: string, granularity: Granularity): PeriodRange | null {
    if (granularity === 'year') {
        const year = Number(period)
        if (!Number.isFinite(year)) return null
        return { from: `${year}-01-01`, to: `${year}-12-31` }
    }

    if (granularity === 'month') {
        const [yearRaw, monthRaw] = period.split('-')
        const year = Number(yearRaw)
        const month = Number(monthRaw)
        if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null
        const lastDay = new Date(year, month, 0).getDate()
        return {
            from: `${year}-${String(month).padStart(2, '0')}-01`,
            to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
        }
    }

    if (granularity === 'day') {
        return { from: period, to: period }
    }

    const match = period.match(/^(\d{4})-W(\d{2})$/)
    if (!match) return null
    const year = Number(match[1])
    const week = Number(match[2])
    const start = isoWeekStart(year, week)
    const end = new Date(start)
    end.setUTCDate(start.getUTCDate() + 6)
    return {
        from: formatDateOnlyUTC(start),
        to: formatDateOnlyUTC(end),
    }
}

function toDateTimeRange(range: PeriodRange): { from: string; to: string } {
    return {
        from: `${range.from}T00:00:00`,
        to: `${range.to}T23:59:59`,
    }
}

function median(values: number[]): number {
    if (!values.length) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    if (sorted.length % 2 === 0) {
        return (sorted[middle - 1] + sorted[middle]) / 2
    }
    return sorted[middle]
}

function asPercent(value: number): string {
    return `${Math.round(value)}%`
}

function typeBadgeClass(type: FileType): string {
    switch (type) {
        case 'pdf':
            return 'border-red-500/30 text-red-400'
        case 'image':
            return 'border-blue-500/30 text-blue-400'
        case 'text':
            return 'border-emerald-500/30 text-emerald-400'
        case 'video':
            return 'border-purple-500/30 text-purple-400'
        case 'email':
            return 'border-amber-500/30 text-amber-400'
        default:
            return 'border-muted text-muted-foreground'
    }
}

function LoadingMetric({ className }: { className?: string }) {
    return <span className={cn('inline-block animate-pulse rounded-md bg-muted/40', className)} />
}

export function TimelinePage() {
    const [zoomStack, setZoomStack] = useState<ZoomLevel[]>([])
    const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
    const [activeDecade, setActiveDecade] = useState<number | null>(null)
    const [selectedFileTypes, setSelectedFileTypes] = useState<FileType[]>([])
    const [periodDocuments, setPeriodDocuments] = useState<Document[]>([])
    const [periodTotal, setPeriodTotal] = useState(0)
    const [isLoadingPeriodDocs, setIsLoadingPeriodDocs] = useState(false)
    const [periodDocsError, setPeriodDocsError] = useState<string | null>(null)
    const selectedPeriodCardRef = useRef<HTMLDivElement | null>(null)

    const { t, locale } = useTranslation()
    const navigate = useNavigate()
    const { selectedProject } = useProject()

    const currentZoom = zoomStack.length > 0 ? zoomStack[zoomStack.length - 1] : null
    const currentGranularity: Granularity = currentZoom?.granularity || 'year'

    const { data, range, isLoading, error, refetch } = useTimeline({
        granularity: currentGranularity,
        fileTypes: selectedFileTypes.length ? selectedFileTypes : undefined,
    })

    const timelinePoints = data?.data || []
    const totalDocuments = data?.total_documents || range?.total_documents || 0
    const isInitialLoad = isLoading && !data && !range

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

    const decadeCounts = useMemo(() => {
        if (!timelinePoints.length) return {} as Record<number, number>
        const counts: Record<number, number> = {}
        timelinePoints.forEach(point => {
            const year = parseInt(point.date.split('-')[0], 10)
            const decade = Math.floor(year / 10) * 10
            counts[decade] = (counts[decade] || 0) + point.count
        })
        return counts
    }, [timelinePoints])

    const canZoomIn = GRANULARITY_ORDER.indexOf(currentGranularity) < GRANULARITY_ORDER.length - 1
    const canZoomOut = zoomStack.length > 0

    useEffect(() => {
        if (currentGranularity !== 'year' && activeDecade !== null) {
            setActiveDecade(null)
        }
    }, [activeDecade, currentGranularity])

    const handleDateClick = useCallback((date: string) => {
        if (canZoomIn) {
            const nextIdx = GRANULARITY_ORDER.indexOf(currentGranularity) + 1
            const nextGranularity = GRANULARITY_ORDER[nextIdx]

            let dateFrom: string
            let dateTo: string
            let label: string

            if (currentGranularity === 'year') {
                const year = date.split('-')[0]
                dateFrom = `${year}-01`
                dateTo = `${year}-12`
                label = year
            } else if (currentGranularity === 'month') {
                const [year, month] = date.split('-')
                const monthDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1)
                const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate()
                dateFrom = `${year}-${month}-01`
                dateTo = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
                label = monthDate.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
                    month: 'short',
                    year: 'numeric',
                })
            } else {
                setSelectedBucket(date)
                return
            }

            setZoomStack(prev => [...prev, { granularity: nextGranularity, label, dateFrom, dateTo }])
            setSelectedBucket(null)
            setPeriodDocuments([])
            setPeriodTotal(0)
        } else {
            setSelectedBucket(date)
        }
    }, [canZoomIn, currentGranularity, locale])

    const handleZoomOut = useCallback(() => {
        setZoomStack(prev => prev.slice(0, -1))
        setSelectedBucket(null)
        setPeriodDocuments([])
        setPeriodTotal(0)
    }, [])

    const handleBreadcrumbClick = useCallback((index: number) => {
        if (index < 0) {
            setZoomStack([])
        } else {
            setZoomStack(prev => prev.slice(0, index + 1))
        }
        setSelectedBucket(null)
        setPeriodDocuments([])
        setPeriodTotal(0)
    }, [])

    const handleDecadeClick = useCallback((decade: number) => {
        setZoomStack([])
        setSelectedBucket(null)
        setPeriodDocuments([])
        setPeriodTotal(0)
        setActiveDecade((prev) => (prev === decade ? null : decade))
    }, [])

    const toggleFileType = useCallback((type: FileType) => {
        setSelectedBucket(null)
        setPeriodDocuments([])
        setPeriodTotal(0)
        setSelectedFileTypes(prev => (
            prev.includes(type)
                ? prev.filter(item => item !== type)
                : [...prev, type]
        ))
    }, [])

    const clearFileTypes = useCallback(() => {
        setSelectedBucket(null)
        setPeriodDocuments([])
        setPeriodTotal(0)
        setSelectedFileTypes([])
    }, [])

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

    const visiblePoints = useMemo(() => {
        if (!timelinePoints.length) return []
        return timelinePoints.filter((point) => {
            if (effectiveDateFrom && point.date < effectiveDateFrom) return false
            if (effectiveDateTo && point.date > effectiveDateTo) return false
            return true
        })
    }, [timelinePoints, effectiveDateFrom, effectiveDateTo])

    const visibleTotal = useMemo(
        () => visiblePoints.reduce((acc, point) => acc + point.count, 0),
        [visiblePoints]
    )

    const loneBucketDate = visiblePoints.length === 1 ? visiblePoints[0]?.date : null

    // If the timeline collapses to a single visible bucket, auto-select it so the page
    // immediately shows the document list (avoids the "empty" feeling).
    useEffect(() => {
        if (selectedBucket) return
        if (isLoading) return
        if (!loneBucketDate) return
        setSelectedBucket(loneBucketDate)
    }, [isLoading, loneBucketDate, selectedBucket])

    // On small screens, scroll the selected period panel into view after selection.
    useEffect(() => {
        if (!selectedBucket) return
        try {
            if (window.matchMedia && window.matchMedia('(max-width: 1024px)').matches) {
                selectedPeriodCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
        } catch {
            // ignore
        }
    }, [selectedBucket])

    const sortedVisible = useMemo(
        () => [...visiblePoints].sort((a, b) => b.count - a.count),
        [visiblePoints]
    )

    const peakPeriod = sortedVisible[0] || null
    const topPeriods = sortedVisible.slice(0, 6)

    const anomalies = useMemo(() => {
        if (!visiblePoints.length) return []
        const baselineMedian = median(visiblePoints.map(p => p.count))
        const minSpike = Math.max(5, Math.ceil(baselineMedian * 2))
        return visiblePoints
            .filter(point => point.count >= minSpike)
            .sort((a, b) => b.count - a.count)
            .slice(0, 8)
    }, [visiblePoints])

    const concentrationTop3 = useMemo(() => {
        if (visibleTotal <= 0) return 0
        const top3Total = sortedVisible.slice(0, 3).reduce((acc, item) => acc + item.count, 0)
        return (top3Total / visibleTotal) * 100
    }, [sortedVisible, visibleTotal])

    const recentTrend = useMemo(() => {
        if (visiblePoints.length < 6) return { direction: 'stable' as const, delta: 0 }
        const tail = visiblePoints.slice(-6)
        const previousAvg = (tail[0].count + tail[1].count + tail[2].count) / 3
        const recentAvg = (tail[3].count + tail[4].count + tail[5].count) / 3
        if (previousAvg <= 0) {
            return { direction: recentAvg > 0 ? 'up' as const : 'stable' as const, delta: 100 }
        }
        const delta = ((recentAvg - previousAvg) / previousAvg) * 100
        if (delta > 20) return { direction: 'up' as const, delta }
        if (delta < -20) return { direction: 'down' as const, delta }
        return { direction: 'stable' as const, delta }
    }, [visiblePoints])

    const selectedRange = useMemo(() => {
        if (!selectedBucket) return null
        return getPeriodRange(selectedBucket, currentGranularity)
    }, [selectedBucket, currentGranularity])

    const selectedBucketCount = useMemo(() => {
        if (!selectedBucket) return 0
        const found = visiblePoints.find((point) => point.date === selectedBucket)
        return found?.count || 0
    }, [selectedBucket, visiblePoints])

    useEffect(() => {
        if (!selectedBucket) return
        if (!visiblePoints.some(point => point.date === selectedBucket)) {
            setSelectedBucket(null)
            setPeriodDocuments([])
            setPeriodTotal(0)
        }
    }, [selectedBucket, visiblePoints])

    useEffect(() => {
        let cancelled = false

        async function fetchPeriodDocuments() {
            if (!selectedBucket || !selectedProject || !selectedRange) {
                setPeriodDocuments([])
                setPeriodTotal(0)
                setPeriodDocsError(null)
                return
            }

            setIsLoadingPeriodDocs(true)
            setPeriodDocsError(null)

            try {
                const dateTimeRange = toDateTimeRange(selectedRange)
                const response = await getDocuments({
                    project_path: selectedProject.path,
                    date_from: dateTimeRange.from,
                    date_to: dateTimeRange.to,
                    file_types: selectedFileTypes.length ? selectedFileTypes : undefined,
                    limit: 80,
                    sort_by: 'modified_desc',
                })

                if (cancelled) return
                setPeriodDocuments(response.documents)
                setPeriodTotal(response.total)
            } catch (err) {
                if (cancelled) return
                setPeriodDocuments([])
                setPeriodTotal(0)
                setPeriodDocsError(err instanceof Error ? err.message : 'Failed to load period documents')
            } finally {
                if (!cancelled) {
                    setIsLoadingPeriodDocs(false)
                }
            }
        }

        fetchPeriodDocuments()
        return () => {
            cancelled = true
        }
    }, [selectedBucket, selectedFileTypes, selectedProject, selectedRange])

    const fileTypeFilters = useMemo(
        () => [
            { key: 'pdf' as FileType, label: t('timeline.typePdf') },
            { key: 'image' as FileType, label: t('timeline.typeImage') },
            { key: 'text' as FileType, label: t('timeline.typeText') },
            { key: 'video' as FileType, label: t('timeline.typeVideo') },
            { key: 'email' as FileType, label: t('timeline.typeEmail') },
            { key: 'unknown' as FileType, label: t('timeline.typeOther') },
        ],
        [t]
    )

    const selectedPeriodLabel = selectedBucket
        ? formatPeriodLabel(selectedBucket, currentGranularity, locale)
        : null

    const trendBadge = (() => {
        if (recentTrend.direction === 'up') {
            return (
                <span className="inline-flex items-center gap-1 text-red-400">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    +{Math.round(recentTrend.delta)}%
                </span>
            )
        }
        if (recentTrend.direction === 'down') {
            return (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                    <ArrowDownRight className="h-3.5 w-3.5" />
                    {Math.round(recentTrend.delta)}%
                </span>
            )
        }
        return (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Minus className="h-3.5 w-3.5" />
                {t('timeline.stable')}
            </span>
        )
    })()

    const handleOpenSearchWorkspace = useCallback(() => {
        const params = new URLSearchParams()
        if (selectedBucket) params.set('date', selectedBucket)
        if (selectedFileTypes.length) params.set('types', selectedFileTypes.join(','))

        const qs = params.toString()
        navigate(qs ? `/?${qs}` : '/')
    }, [navigate, selectedBucket, selectedFileTypes])

    return (
        <div className="h-full overflow-auto p-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="flex items-center gap-3">
                    <Calendar className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">{t('timeline.title')}</h1>
                        <p className="text-muted-foreground">{t('timeline.subtitle')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <FileText className="h-8 w-8 text-blue-500" />
                                <div>
                                    <p className="text-2xl font-bold">
                                        {isInitialLoad ? (
                                            <LoadingMetric className="h-7 w-20 align-middle" />
                                        ) : (
                                            formatNumber(totalDocuments)
                                        )}
                                    </p>
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
                                    <p className="text-2xl font-bold">
                                        {isInitialLoad ? (
                                            <LoadingMetric className="h-7 w-16 align-middle" />
                                        ) : (
                                            formatNumber(visiblePoints.length)
                                        )}
                                    </p>
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
                                    <p className="text-sm font-bold truncate">
                                        {isInitialLoad ? (
                                            <LoadingMetric className="h-4 w-28 align-middle" />
                                        ) : (
                                            formatDate(range?.min_date, locale)
                                        )}
                                    </p>
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
                                    <p className="text-sm font-bold truncate">
                                        {isInitialLoad ? (
                                            <LoadingMetric className="h-4 w-28 align-middle" />
                                        ) : (
                                            formatDate(range?.max_date, locale)
                                        )}
                                    </p>
                                    <p className="text-sm text-muted-foreground">{t('timeline.end')}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardContent className="pt-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <Filter className="h-3.5 w-3.5" />
                                {t('timeline.filterByType')}
                            </span>
                            <Button
                                size="sm"
                                variant={selectedFileTypes.length === 0 ? 'default' : 'outline'}
                                className="h-7 text-xs"
                                onClick={clearFileTypes}
                            >
                                {t('timeline.typeAll')}
                            </Button>
                            {fileTypeFilters.map(({ key, label }) => {
                                const isActive = selectedFileTypes.includes(key)
                                return (
                                    <Button
                                        key={key}
                                        size="sm"
                                        variant={isActive ? 'default' : 'outline'}
                                        className="h-7 text-xs"
                                        onClick={() => toggleFileType(key)}
                                    >
                                        {label}
                                    </Button>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-1">
                                <Flame className="h-3.5 w-3.5 text-orange-400" />
                                {t('timeline.peakPeriod')}
                            </div>
                            <div className="text-sm font-semibold">
                                {peakPeriod ? formatPeriodLabel(peakPeriod.date, currentGranularity, locale) : '-'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {peakPeriod ? `${formatNumber(peakPeriod.count)} ${t('timeline.documents')}` : '-'}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-1">
                                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                                {t('timeline.anomaliesCount')}
                            </div>
                            <div className="text-sm font-semibold">{formatNumber(anomalies.length)}</div>
                            <div className="text-xs text-muted-foreground mt-1">{t('timeline.spikeDefinition')}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-1">
                                <Activity className="h-3.5 w-3.5 text-primary" />
                                {t('timeline.concentrationTop3')}
                            </div>
                            <div className="text-sm font-semibold">{asPercent(concentrationTop3)}</div>
                            <div className="text-xs text-muted-foreground mt-1">{t('timeline.ofVisibleDocuments').replace('{count}', formatNumber(visibleTotal))}</div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-5">
                            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-1">
                                <Calendar className="h-3.5 w-3.5 text-sky-400" />
                                {t('timeline.recentTrend')}
                            </div>
                            <div className="text-sm font-semibold">{trendBadge}</div>
                            <div className="text-xs text-muted-foreground mt-1">{t('timeline.lastBucketsComparison')}</div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5 text-sm">
                        <button
                            onClick={() => handleBreadcrumbClick(-1)}
                            className={cn(
                                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                zoomStack.length === 0
                                    ? 'bg-primary/15 text-primary'
                                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                            )}
                        >
                            {t('timeline.allYears')}
                        </button>

                        {zoomStack.map((level, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                                <button
                                    onClick={() => handleBreadcrumbClick(i)}
                                    className={cn(
                                        'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                        i === zoomStack.length - 1
                                            ? 'bg-primary/15 text-primary'
                                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                    )}
                                >
                                    {level.label}
                                </button>
                            </div>
                        ))}
                    </div>

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
                        <span className="w-14 text-center text-[10px] font-medium uppercase text-muted-foreground">
                            {currentGranularity === 'year' ? t('timeline.byYear') : currentGranularity === 'month' ? t('timeline.byMonth') : t('timeline.byDay')}
                        </span>
                    </div>
                </div>

                {currentGranularity === 'year' && decades.length > 1 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <ChevronsRight className="h-3.5 w-3.5" />
                            {t('timeline.decades')}
                        </span>
                        {decades.map(decade => {
                            const count = decadeCounts[decade] || 0
                            const isActive = activeDecade === decade
                            return (
                                <Button
                                    key={decade}
                                    variant={isActive ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => handleDecadeClick(decade)}
                                    className={cn('h-7 gap-1 text-xs', isActive && 'ring-2 ring-primary/30')}
                                >
                                    {decade}s
                                    {count > 0 && (
                                        <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                                            {formatNumber(count)}
                                        </Badge>
                                    )}
                                </Button>
                            )
                        })}
                    </div>
                )}

                {!isLoading && !error && totalDocuments === 0 && (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                            <FolderOpen className="mb-4 h-16 w-16 text-muted-foreground/50" />
                            <h3 className="mb-1 text-lg font-semibold">{t('timeline.emptyTitle')}</h3>
                            <p className="mb-6 max-w-md text-sm text-muted-foreground">{t('timeline.emptyDescription')}</p>
                            <Button asChild variant="default">
                                <Link to="/scans">{t('timeline.goToScans')}</Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {(!isLoading && !error && totalDocuments === 0) ? null : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <Card className="lg:col-span-2">
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
                                    <div className="mb-3 h-48"><TimelineSkeleton /></div>
                                )}
                                <TimelineHeatmap
                                    granularity={currentGranularity}
                                    dataPoints={timelinePoints}
                                    totalDocuments={totalDocuments}
                                    isLoading={isLoading}
                                    error={error}
                                    onRetry={refetch}
                                    onDateSelect={handleDateClick}
                                    dateFrom={effectiveDateFrom}
                                    dateTo={effectiveDateTo}
                                    selectedDate={selectedBucket}
                                />
                            </CardContent>
                        </Card>

                        <Card
                            ref={selectedPeriodCardRef}
                            className={cn(
                                selectedBucket && 'border-primary/40',
                                'lg:sticky lg:top-6 lg:self-start'
                            )}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <CardTitle className="text-base">
                                        {t('timeline.selectedPeriod')}
                                        {selectedPeriodLabel && (
                                            <span className="ml-2 text-primary">{selectedPeriodLabel}</span>
                                        )}
                                    </CardTitle>
                                    <div className="flex items-center gap-2">
                                        <Button size="sm" variant="outline" onClick={handleOpenSearchWorkspace} className="gap-1.5">
                                            <Search className="h-3.5 w-3.5" />
                                            {t('timeline.openSearchWorkspace')}
                                        </Button>
                                        {periodDocuments[0] && (
                                            <Button
                                                size="sm"
                                                onClick={() => navigate(`/?doc=${periodDocuments[0].id}`)}
                                                className="gap-1.5"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                                {t('timeline.openDocument')}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {!selectedBucket ? (
                                    <p className="text-sm text-muted-foreground">{t('timeline.selectPeriodHint')}</p>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="text-xs text-muted-foreground">
                                            {selectedRange
                                                ? t('timeline.periodRange').replace('{from}', selectedRange.from).replace('{to}', selectedRange.to)
                                                : '-'}
                                            {' · '}
                                            {formatNumber(selectedBucketCount)} {t('timeline.documents')}
                                            {' · '}
                                            {t('timeline.docsShown').replace('{count}', formatNumber(periodTotal))}
                                        </div>

                                        {isLoadingPeriodDocs && (
                                            <div className="space-y-2">
                                                <TimelineSkeleton />
                                            </div>
                                        )}

                                        {!isLoadingPeriodDocs && periodDocsError && (
                                            <p className="text-sm text-red-400">{t('timeline.error')}: {periodDocsError}</p>
                                        )}

                                        {!isLoadingPeriodDocs && !periodDocsError && periodDocuments.length === 0 && (
                                            <p className="text-sm text-muted-foreground">{t('timeline.noDocumentsInPeriod')}</p>
                                        )}

                                        {!isLoadingPeriodDocs && !periodDocsError && periodDocuments.length > 0 && (
                                            <div className="space-y-2">
                                                {periodDocuments.slice(0, 20).map((doc) => (
                                                    <button
                                                        key={doc.id}
                                                        onClick={() => navigate(`/?doc=${doc.id}`)}
                                                        className="flex w-full items-center justify-between rounded-md border border-border/60 bg-card/30 px-3 py-2 text-left hover:border-primary/40 hover:bg-muted/30"
                                                    >
                                                        <div className="min-w-0 pr-3">
                                                            <p className="truncate text-sm font-medium">{doc.file_name}</p>
                                                            <p className="text-xs text-muted-foreground truncate">
                                                                {formatDate(doc.file_modified_at || doc.indexed_at, locale)}
                                                            </p>
                                                        </div>
                                                        <Badge variant="outline" className={typeBadgeClass(doc.file_type)}>
                                                            {doc.file_type}
                                                        </Badge>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {visiblePoints.length > 0 && (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{t('timeline.topPeriods')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {topPeriods.map((period) => (
                                    <button
                                        key={period.date}
                                        onClick={() => setSelectedBucket(period.date)}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-md border border-transparent px-3 py-2 text-left transition-colors',
                                            selectedBucket === period.date
                                                ? 'border-primary/40 bg-primary/10'
                                                : 'hover:border-border hover:bg-muted/40'
                                        )}
                                    >
                                        <span className="text-sm font-medium">
                                            {formatPeriodLabel(period.date, currentGranularity, locale)}
                                        </span>
                                        <Badge variant="secondary">{formatNumber(period.count)}</Badge>
                                    </button>
                                ))}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">{t('timeline.anomaliesDetected')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {anomalies.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">{t('timeline.noAnomalies')}</p>
                                ) : anomalies.map((period) => (
                                    <button
                                        key={`anomaly-${period.date}`}
                                        onClick={() => setSelectedBucket(period.date)}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-md border border-transparent px-3 py-2 text-left transition-colors',
                                            selectedBucket === period.date
                                                ? 'border-primary/40 bg-primary/10'
                                                : 'hover:border-border hover:bg-muted/40'
                                        )}
                                    >
                                        <span className="inline-flex items-center gap-2 text-sm font-medium">
                                            <AlertTriangle className="h-4 w-4 text-red-400" />
                                            {formatPeriodLabel(period.date, currentGranularity, locale)}
                                        </span>
                                        <Badge variant="secondary">{formatNumber(period.count)}</Badge>
                                    </button>
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                )}

            </div>
        </div>
    )
}
