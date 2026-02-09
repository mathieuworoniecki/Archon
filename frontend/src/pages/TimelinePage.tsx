import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Clock, FileText, Activity, ArrowRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TimelineHeatmap } from '@/components/timeline/TimelineHeatmap'
import { useTimeline } from '@/hooks/useTimeline'
import { useTranslation } from '@/contexts/I18nContext'

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
    const { data, range, isLoading, error } = useTimeline({ granularity: 'month' })
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const { t } = useTranslation()
    const navigate = useNavigate()

    // Use a single source of truth for total documents
    const totalDocuments = data?.total_documents || range?.total_documents || 0

    const handleDateClick = (date: string) => {
        setSelectedDate(date)
    }

    const handleGoToCockpit = () => {
        if (selectedDate) {
            navigate(`/cockpit?date=${encodeURIComponent(selectedDate)}`)
        }
    }

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

                {/* Heatmap */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('timeline.heatmap')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="h-48 flex items-center justify-center text-muted-foreground">
                                {t('timeline.loadingTimeline')}
                            </div>
                        ) : error ? (
                            <div className="h-48 flex items-center justify-center text-red-500">
                                {t('timeline.error')}: {error}
                            </div>
                        ) : (
                            <TimelineHeatmap 
                                granularity="month"
                                onDateSelect={handleDateClick}
                            />
                        )}
                    </CardContent>
                </Card>

                {/* Selected Date Details */}
                {selectedDate && (
                    <Card className="border-primary/50">
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>{t('timeline.documentsOf')} {selectedDate}</span>
                                <Button size="sm" onClick={handleGoToCockpit} className="gap-1.5">
                                    Ouvrir dans le Cockpit
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground text-sm">
                                Cliquez sur le bouton ci-dessus pour explorer les documents de cette période dans le Cockpit avec les filtres pré-remplis.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
