import { FolderOpen, HardDrive, FileText, Clock, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/contexts/I18nContext'

export interface ProjectSelectorItem {
    name: string
    path: string
    file_count: number
    total_size_bytes: number
    last_modified: string | null
    subdirectories: number
}

interface ProjectSelectorProps {
    projects: ProjectSelectorItem[]
    selectedProject: ProjectSelectorItem | null
    onSelect: (project: ProjectSelectorItem) => void
    isLoading?: boolean
    documentsPath?: string
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDate(dateStr: string | null, locale: string): string {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    })
}

export function ProjectSelector({
    projects,
    selectedProject,
    onSelect,
    isLoading,
    documentsPath
}: ProjectSelectorProps) {
    const { t, locale } = useTranslation()

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground py-8">
                <FolderOpen className="h-5 w-5 animate-pulse" />
                <span>{t('projects.loading')}</span>
            </div>
        )
    }

    if (projects.length === 0) {
        return (
            <Card className="p-6 text-center">
                <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="font-medium">{t('projects.noProjects')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                    {t('projects.createIn')} <code className="text-xs bg-muted px-1 rounded">{documentsPath}</code>
                </p>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <HardDrive className="h-4 w-4" />
                <span>{t('projects.selectProject')}</span>
                <Badge variant="secondary">{projects.length} {projects.length > 1 ? t('projects.projectCountPlural') : t('projects.projectCount')}</Badge>
            </div>

            <div className="grid gap-3">
                {projects.map((project) => {
                    const isSelected = selectedProject?.name === project.name
                    return (
                        <Card
                            key={project.name}
                            onClick={() => onSelect(project)}
                            className={cn(
                                "p-4 cursor-pointer transition-all hover:border-primary/50",
                                "flex items-center justify-between group",
                                isSelected && "border-primary bg-primary/5 ring-1 ring-primary/20"
                            )}
                        >
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "p-3 rounded-lg transition-colors",
                                    isSelected ? "bg-primary/20" : "bg-muted"
                                )}>
                                    <FolderOpen className={cn(
                                        "h-6 w-6",
                                        isSelected ? "text-primary" : "text-muted-foreground"
                                    )} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">{project.name}</h3>
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                                        <span className="flex items-center gap-1">
                                            <FileText className="h-3.5 w-3.5" />
                                            {project.file_count} {t('projects.files')}
                                        </span>
                                        <span>{formatBytes(project.total_size_bytes)}</span>
                                        {project.last_modified && (
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3.5 w-3.5" />
                                                {formatDate(project.last_modified, locale)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <ChevronRight className={cn(
                                "h-5 w-5 text-muted-foreground transition-transform",
                                "group-hover:translate-x-1",
                                isSelected && "text-primary"
                            )} />
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
