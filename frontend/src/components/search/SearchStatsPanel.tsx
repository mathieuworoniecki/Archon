import { useStats } from '@/hooks/useStats'
import { useTranslation } from '@/contexts/I18nContext'
import { SearchResult } from '@/lib/api'
import { FileText, Image, FileType2, Video, Mail, HelpCircle, Database, BarChart3, Clock } from 'lucide-react'

interface SearchStatsPanelProps {
    results: SearchResult[]
    totalResults: number
    lastQuery: string
}

const TYPE_CONFIG = [
    { key: 'pdf', label: 'PDF', icon: FileText, color: 'bg-red-500' },
    { key: 'image', label: 'Images', icon: Image, color: 'bg-blue-500' },
    { key: 'text', label: 'Text', icon: FileType2, color: 'bg-green-500' },
    { key: 'video', label: 'Video', icon: Video, color: 'bg-purple-500' },
    { key: 'email', label: 'Email', icon: Mail, color: 'bg-amber-500' },
    { key: 'unknown', label: 'Other', icon: HelpCircle, color: 'bg-gray-500' },
] as const

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function SearchStatsPanel({ results, totalResults, lastQuery }: SearchStatsPanelProps) {
    const { stats } = useStats()
    const { t } = useTranslation()

    if (!stats) {
        return (
            <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="animate-pulse">{t('home.loading')}</div>
            </div>
        )
    }

    const byType = stats.documents_by_type
    const maxCount = Math.max(...TYPE_CONFIG.map(tc => (byType as unknown as Record<string, number>)[tc.key] || 0), 1)

    // If there's a search with results, show search result stats
    const hasSearchResults = lastQuery && totalResults > 0

    // Count types in current results
    const resultTypeCounts: Record<string, number> = {}
    if (hasSearchResults) {
        results.forEach(r => {
            const ft = r.file_type || 'unknown'
            resultTypeCounts[ft] = (resultTypeCounts[ft] || 0) + 1
        })
    }

    return (
        <div className="h-full overflow-auto p-6">
            <div className="max-w-lg mx-auto space-y-6">
                {/* Header */}
                <div className="text-center space-y-1">
                    <BarChart3 className="h-8 w-8 mx-auto text-primary/40" />
                    <h3 className="text-lg font-semibold">
                        {hasSearchResults ? t('stats.searchResults') : t('stats.projectOverview')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {hasSearchResults
                            ? `${totalResults} ${t('stats.resultsForLabel')} "${lastQuery}"`
                            : t('stats.selectDocument')
                        }
                    </p>
                </div>

                {/* Search Result Type Breakdown */}
                {hasSearchResults && Object.keys(resultTypeCounts).length > 0 && (
                    <div className="rounded-lg border bg-card/50 p-4 space-y-3">
                        <h4 className="text-sm font-medium text-muted-foreground">{t('stats.resultsByType')}</h4>
                        {TYPE_CONFIG
                            .filter(tc => resultTypeCounts[tc.key])
                            .map(({ key, label, icon: Icon, color }) => {
                                const count = resultTypeCounts[key] || 0
                                const pct = (count / totalResults) * 100
                                return (
                                    <div key={key} className="flex items-center gap-3">
                                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <span className="text-xs w-14 shrink-0">{label}</span>
                                        <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                                            <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{count}</span>
                                    </div>
                                )
                            })
                        }
                    </div>
                )}

                {/* Project-Level Stats */}
                <div className="rounded-lg border bg-card/50 p-4 space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">{t('stats.documentsByType')}</h4>
                    {TYPE_CONFIG.map(({ key, label, icon: Icon, color }) => {
                        const count = (byType as unknown as Record<string, number>)[key] || 0
                        if (count === 0) return null
                        const pct = (count / maxCount) * 100
                        return (
                            <div key={key} className="flex items-center gap-3">
                                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-xs w-14 shrink-0">{label}</span>
                                <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                                    <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">{count.toLocaleString()}</span>
                            </div>
                        )
                    })}
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                        <Database className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                        <div className="text-lg font-bold tabular-nums">{stats.total_documents.toLocaleString()}</div>
                        <div className="text-[10px] text-muted-foreground">{t('stats.totalDocuments')}</div>
                    </div>
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                        <BarChart3 className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                        <div className="text-lg font-bold tabular-nums">{formatBytes(stats.total_file_size_bytes)}</div>
                        <div className="text-[10px] text-muted-foreground">{t('stats.totalSize')}</div>
                    </div>
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                        <FileText className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                        <div className="text-lg font-bold tabular-nums">{stats.total_scans}</div>
                        <div className="text-[10px] text-muted-foreground">{t('stats.totalScans')}</div>
                    </div>
                    <div className="rounded-lg border bg-card/50 p-3 text-center">
                        <Clock className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                        <div className="text-sm font-bold tabular-nums">
                            {stats.last_scan_date
                                ? new Date(stats.last_scan_date).toLocaleDateString()
                                : '—'}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{t('stats.lastScan')}</div>
                    </div>
                </div>
            </div>
        </div>
    )
}
