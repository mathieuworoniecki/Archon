import { useCallback, useEffect, useState } from 'react'
import { BellRing, Play, Trash2, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    listWatchlistRules,
    createWatchlistRule,
    deleteWatchlistRule,
    runWatchlistRule,
    type WatchlistRule,
} from '@/lib/api'
import { toast } from 'sonner'
import { useTranslation } from '@/contexts/I18nContext'

export function WatchlistPage() {
    const { t } = useTranslation()
    const [rules, setRules] = useState<WatchlistRule[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isCreating, setIsCreating] = useState(false)
    const [name, setName] = useState('')
    const [query, setQuery] = useState('')

    const loadRules = useCallback(async () => {
        setIsLoading(true)
        try {
            setRules(await listWatchlistRules())
        } catch {
            toast.error(t('watchlist.loadError'))
        } finally {
            setIsLoading(false)
        }
    }, [t])

    useEffect(() => {
        loadRules()
    }, [loadRules])

    const handleCreate = async () => {
        const trimmedName = name.trim()
        const trimmedQuery = query.trim()
        if (!trimmedName || !trimmedQuery) return
        setIsCreating(true)
        try {
            await createWatchlistRule({ name: trimmedName, query: trimmedQuery, frequency_minutes: 60 })
            setName('')
            setQuery('')
            await loadRules()
            toast.success(t('watchlist.created'))
        } catch {
            toast.error(t('watchlist.createError'))
        } finally {
            setIsCreating(false)
        }
    }

    const handleRun = async (ruleId: number) => {
        try {
            const result = await runWatchlistRule(ruleId)
            toast.success(t('watchlist.runSuccess').replace('{count}', String(result.match_count)))
            await loadRules()
        } catch {
            toast.error(t('watchlist.runError'))
        }
    }

    const handleDelete = async (ruleId: number) => {
        try {
            await deleteWatchlistRule(ruleId)
            await loadRules()
            toast.success(t('watchlist.deleted'))
        } catch {
            toast.error(t('watchlist.deleteError'))
        }
    }

    return (
        <div className="h-full overflow-auto p-6">
            <div className="max-w-6xl mx-auto space-y-4">
                <div className="flex items-center gap-3">
                    <BellRing className="h-7 w-7 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">{t('watchlist.title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('watchlist.subtitle')}</p>
                    </div>
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{t('watchlist.createRule')}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex flex-wrap gap-2">
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('watchlist.name')}
                                className="h-9 w-56"
                            />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={t('watchlist.query')}
                                className="h-9 min-w-[280px] flex-1"
                            />
                            <Button onClick={handleCreate} disabled={isCreating} className="h-9 gap-1.5">
                                {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                {t('watchlist.add')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{t('watchlist.rules')}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {isLoading ? (
                            <div className="py-8 flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : rules.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('watchlist.noRules')}</p>
                        ) : (
                            <div className="space-y-2">
                                {rules.map((rule) => (
                                    <div key={rule.id} className="rounded border border-border/60 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="font-medium truncate">{rule.name}</p>
                                                <p className="text-xs text-muted-foreground truncate">{rule.query}</p>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Badge variant={rule.enabled ? 'default' : 'outline'}>
                                                    {rule.enabled ? t('watchlist.enabled') : t('watchlist.disabled')}
                                                </Badge>
                                                <Badge variant="secondary">
                                                    {t('watchlist.matches').replace('{count}', String(rule.last_match_count || 0))}
                                                </Badge>
                                                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={() => handleRun(rule.id)}>
                                                    <Play className="h-3.5 w-3.5" />
                                                    {t('watchlist.run')}
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-red-400 hover:text-red-300" onClick={() => handleDelete(rule.id)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    {t('common.delete')}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
