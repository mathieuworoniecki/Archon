import { useCallback, useMemo, useState } from 'react'
import { ShieldCheck, RefreshCw, FileText, Link as LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/contexts/I18nContext'
import { fetchAuditLogs, fetchDocumentAuditTrail, type AuditLogEntry, type AuditTrailResponse } from '@/lib/api'

const ACTION_OPTIONS = [
    'scan_started',
    'scan_completed',
    'document_indexed',
    'document_deleted',
    'document_viewed',
    'search_performed',
    'export_created',
]

function shortHash(hash: string | null): string {
    if (!hash) return '-'
    return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

function safeNumber(raw: string): number | undefined {
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return undefined
    return value
}

export function AuditPage() {
    const { t } = useTranslation()
    const [action, setAction] = useState('')
    const [documentIdInput, setDocumentIdInput] = useState('')
    const [scanIdInput, setScanIdInput] = useState('')
    const [logs, setLogs] = useState<AuditLogEntry[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [trail, setTrail] = useState<AuditTrailResponse | null>(null)
    const [trailError, setTrailError] = useState<string | null>(null)
    const [loadingTrailDocId, setLoadingTrailDocId] = useState<number | null>(null)

    const filters = useMemo(() => ({
        action: action || undefined,
        document_id: safeNumber(documentIdInput),
        scan_id: safeNumber(scanIdInput),
        limit: 100,
        offset: 0,
    }), [action, documentIdInput, scanIdInput])

    const loadLogs = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const entries = await fetchAuditLogs(filters)
            setLogs(entries)
        } catch (err) {
            setError(err instanceof Error ? err.message : t('audit.loadError'))
            setLogs([])
        } finally {
            setIsLoading(false)
        }
    }, [filters, t])

    const loadTrail = useCallback(async (documentId: number) => {
        setLoadingTrailDocId(documentId)
        setTrailError(null)
        try {
            const payload = await fetchDocumentAuditTrail(documentId)
            setTrail(payload)
        } catch (err) {
            setTrail(null)
            setTrailError(err instanceof Error ? err.message : t('audit.trailError'))
        } finally {
            setLoadingTrailDocId(null)
        }
    }, [t])

    return (
        <div className="h-full overflow-auto p-6">
            <div className="max-w-7xl mx-auto space-y-4">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="h-7 w-7 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">{t('audit.title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('audit.subtitle')}</p>
                    </div>
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{t('audit.filters')}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={action}
                                onChange={(e) => setAction(e.target.value)}
                                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="">{t('audit.allActions')}</option>
                                {ACTION_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                            <Input
                                value={documentIdInput}
                                onChange={(e) => setDocumentIdInput(e.target.value)}
                                placeholder={t('audit.documentId')}
                                className="h-9 w-44"
                            />
                            <Input
                                value={scanIdInput}
                                onChange={(e) => setScanIdInput(e.target.value)}
                                placeholder={t('audit.scanId')}
                                className="h-9 w-44"
                            />
                            <Button className="h-9 gap-1.5" onClick={loadLogs} disabled={isLoading}>
                                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                                {isLoading ? t('audit.loading') : t('audit.load')}
                            </Button>
                        </div>
                        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{t('audit.logs')}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {logs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('audit.noLogs')}</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-muted-foreground">
                                            <th className="px-2 py-2 text-left">{t('audit.createdAt')}</th>
                                            <th className="px-2 py-2 text-left">{t('audit.action')}</th>
                                            <th className="px-2 py-2 text-left">{t('audit.document')}</th>
                                            <th className="px-2 py-2 text-left">{t('audit.scan')}</th>
                                            <th className="px-2 py-2 text-left">{t('audit.hash')}</th>
                                            <th className="px-2 py-2 text-left">{t('audit.previousHash')}</th>
                                            <th className="px-2 py-2 text-left">{t('audit.details')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id} className="border-b border-border/50 align-top">
                                                <td className="px-2 py-2 whitespace-nowrap">
                                                    {new Date(log.created_at).toLocaleString()}
                                                </td>
                                                <td className="px-2 py-2">
                                                    <Badge variant="secondary">{log.action}</Badge>
                                                </td>
                                                <td className="px-2 py-2">
                                                    {log.document_id ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 gap-1 px-2"
                                                            onClick={() => loadTrail(log.document_id as number)}
                                                            disabled={loadingTrailDocId === log.document_id}
                                                        >
                                                            <FileText className="h-3.5 w-3.5" />
                                                            #{log.document_id}
                                                        </Button>
                                                    ) : '-'}
                                                </td>
                                                <td className="px-2 py-2">{log.scan_id ? `#${log.scan_id}` : '-'}</td>
                                                <td className="px-2 py-2 font-mono text-xs">{shortHash(log.entry_hash)}</td>
                                                <td className="px-2 py-2 font-mono text-xs">{shortHash(log.previous_hash)}</td>
                                                <td className="px-2 py-2">
                                                    {log.details ? (
                                                        <pre className="max-w-[420px] overflow-x-auto rounded bg-muted/40 p-2 text-xs">
                                                            {JSON.stringify(log.details, null, 2)}
                                                        </pre>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {(trail || trailError) && (
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <LinkIcon className="h-4 w-4" />
                                {t('audit.trail')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 space-y-3">
                            {trailError && <p className="text-sm text-red-400">{trailError}</p>}
                            {trail && (
                                <>
                                    <div className="text-sm">
                                        <p><span className="text-muted-foreground">{t('audit.document')}:</span> {trail.document.file_name} (#{trail.document.id})</p>
                                        <p className="text-xs text-muted-foreground break-all">{trail.document.file_path}</p>
                                    </div>
                                    <div className="space-y-2">
                                        {trail.audit_trail.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">{t('audit.noTrail')}</p>
                                        ) : trail.audit_trail.map((entry) => (
                                            <div key={entry.id} className="rounded border border-border/60 p-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <Badge variant="outline">{entry.action}</Badge>
                                                    <span className="text-xs text-muted-foreground">
                                                        {new Date(entry.created_at).toLocaleString()}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs font-mono text-muted-foreground">
                                                    {shortHash(entry.entry_hash)} ← {shortHash(entry.previous_hash)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    )
}
