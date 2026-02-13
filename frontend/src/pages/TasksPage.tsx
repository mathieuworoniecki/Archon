import { useCallback, useEffect, useState } from 'react'
import { CheckSquare, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    listInvestigationTasks,
    createInvestigationTask,
    updateInvestigationTask,
    deleteInvestigationTask,
    type InvestigationTask,
} from '@/lib/api'
import { toast } from 'sonner'
import { useTranslation } from '@/contexts/I18nContext'

const STATUS_FLOW: Array<InvestigationTask['status']> = ['todo', 'in_progress', 'blocked', 'done']

function nextStatus(status: InvestigationTask['status']): InvestigationTask['status'] {
    const idx = STATUS_FLOW.indexOf(status)
    return STATUS_FLOW[(idx + 1) % STATUS_FLOW.length]
}

export function TasksPage() {
    const { t } = useTranslation()
    const [tasks, setTasks] = useState<InvestigationTask[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [title, setTitle] = useState('')
    const [isCreating, setIsCreating] = useState(false)

    const loadTasks = useCallback(async () => {
        setIsLoading(true)
        try {
            setTasks(await listInvestigationTasks({ limit: 500 }))
        } catch {
            toast.error(t('tasks.loadError'))
        } finally {
            setIsLoading(false)
        }
    }, [t])

    useEffect(() => {
        loadTasks()
    }, [loadTasks])

    const handleCreate = async () => {
        const trimmed = title.trim()
        if (!trimmed) return
        setIsCreating(true)
        try {
            await createInvestigationTask({ title: trimmed, status: 'todo', priority: 'medium' })
            setTitle('')
            await loadTasks()
            toast.success(t('tasks.created'))
        } catch {
            toast.error(t('tasks.createError'))
        } finally {
            setIsCreating(false)
        }
    }

    const handleCycleStatus = async (task: InvestigationTask) => {
        const status = nextStatus(task.status)
        try {
            await updateInvestigationTask(task.id, { status })
            await loadTasks()
        } catch {
            toast.error(t('tasks.updateError'))
        }
    }

    const handleDelete = async (taskId: number) => {
        try {
            await deleteInvestigationTask(taskId)
            await loadTasks()
            toast.success(t('tasks.deleted'))
        } catch {
            toast.error(t('tasks.deleteError'))
        }
    }

    return (
        <div className="h-full overflow-auto p-6">
            <div className="max-w-6xl mx-auto space-y-4">
                <div className="flex items-center gap-3">
                    <CheckSquare className="h-7 w-7 text-primary" />
                    <div>
                        <h1 className="text-2xl font-bold">{t('tasks.title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('tasks.subtitle')}</p>
                    </div>
                </div>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{t('tasks.create')}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="flex gap-2">
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={t('tasks.titlePlaceholder')}
                                className="h-9"
                            />
                            <Button onClick={handleCreate} disabled={isCreating} className="h-9 gap-1.5">
                                {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                {t('tasks.add')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{t('tasks.list')}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {isLoading ? (
                            <div className="py-8 flex items-center justify-center">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : tasks.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('tasks.noTasks')}</p>
                        ) : (
                            <div className="space-y-2">
                                {tasks.map((task) => (
                                    <div key={task.id} className="rounded border border-border/60 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="font-medium truncate">{task.title}</p>
                                                {task.description && (
                                                    <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <Badge variant="outline">{task.priority}</Badge>
                                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleCycleStatus(task)}>
                                                    <Badge variant="secondary">{task.status}</Badge>
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-red-400 hover:text-red-300" onClick={() => handleDelete(task.id)}>
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
