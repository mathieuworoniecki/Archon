import { useState } from 'react'
import { Calendar, Clock, FileText, Activity } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { TimelineHeatmap } from '@/components/timeline/TimelineHeatmap'
import { useTimeline } from '@/hooks/useTimeline'

export function TimelinePage() {
    const { data, range, isLoading, error } = useTimeline({ granularity: 'month' })
    const [selectedDate, setSelectedDate] = useState<string | null>(null)

    const handleDateClick = (date: string) => {
        setSelectedDate(date)
    }

    return (
        <div className="h-full p-6 overflow-auto">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Calendar className="h-8 w-8 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">Timeline</h1>
                        <p className="text-muted-foreground">
                            Visualisation chronologique des documents
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
                                    <p className="text-2xl font-bold">{data?.total_documents || 0}</p>
                                    <p className="text-sm text-muted-foreground">Documents</p>
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
                                    <p className="text-sm text-muted-foreground">Périodes actives</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <Clock className="h-8 w-8 text-orange-500" />
                                <div>
                                    <p className="text-sm font-bold truncate">{range?.min_date || '-'}</p>
                                    <p className="text-sm text-muted-foreground">Début</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-3">
                                <Activity className="h-8 w-8 text-purple-500" />
                                <div>
                                    <p className="text-sm font-bold truncate">{range?.max_date || '-'}</p>
                                    <p className="text-sm text-muted-foreground">Fin</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Heatmap */}
                <Card>
                    <CardHeader>
                        <CardTitle>Heatmap des documents</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="h-48 flex items-center justify-center text-muted-foreground">
                                Chargement de la timeline...
                            </div>
                        ) : error ? (
                            <div className="h-48 flex items-center justify-center text-red-500">
                                Erreur: {error}
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
                    <Card>
                        <CardHeader>
                            <CardTitle>Documents du {selectedDate}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">
                                Sélectionnez un document dans le Cockpit pour voir les détails.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
