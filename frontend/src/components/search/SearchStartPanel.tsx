import { Search, FileText, Sparkles } from 'lucide-react'
import { useTranslation } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

const RECENT_KEY = 'archon_recent_searches'

function getRecentSearches(): string[] {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    } catch {
        return []
    }
}

interface SearchStartPanelProps {
    onSearch: (query: string) => void
    className?: string
}

export function SearchStartPanel({ onSearch, className }: SearchStartPanelProps) {
    const { t } = useTranslation()
    const recent = getRecentSearches()

    return (
        <div className={cn('flex flex-col flex-1 overflow-auto p-6', className)}>
            <div className="max-w-md mx-auto w-full space-y-8">
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-3">
                        <Search className="h-6 w-6 text-primary" />
                    </div>
                    <h2 className="text-lg font-semibold">{t('home.searchTitle')}</h2>
                    <p className="text-sm text-muted-foreground">{t('home.searchHint')}</p>
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-2.5 py-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        {t('searchBar.keywords')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-2.5 py-1 text-xs text-muted-foreground">
                        <Sparkles className="h-3 w-3" />
                        {t('searchBar.semantic')}
                    </span>
                </div>

                {recent.length > 0 && (
                    <div className="space-y-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {t('home.recentSearches')}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {recent.slice(0, 8).map((q) => (
                                <button
                                    key={q}
                                    type="button"
                                    onClick={() => onSearch(q)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-accent hover:border-primary/30 transition-colors text-left max-w-[200px] truncate"
                                    title={q}
                                >
                                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="truncate">{q}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
