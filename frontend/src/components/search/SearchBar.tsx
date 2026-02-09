import { useState, useEffect, FormEvent } from 'react'
import { Search, Sparkles, Zap, Loader2, FolderOpen } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { API_BASE } from '@/lib/api'
import { useTranslation } from '@/contexts/I18nContext'
import { useProject } from '@/contexts/ProjectContext'

interface Project {
    name: string
    path: string
    file_count: number
}

interface SearchBarProps {
    onSearch: (query: string, semanticWeight: number, projectPath?: string) => void
    isLoading?: boolean
    disabled?: boolean
}

export function SearchBar({ onSearch, isLoading, disabled }: SearchBarProps) {
    const [query, setQuery] = useState('')
    const [semanticWeight, setSemanticWeight] = useState(0.5)
    const [projects, setProjects] = useState<Project[]>([])
    const [selectedProject, setSelectedProject] = useState<string>('__all__')
    const { t } = useTranslation()
    const { selectedProject: contextProject } = useProject()

    // Fetch projects on mount
    useEffect(() => {
        fetch(`${API_BASE}/projects/`)
            .then(res => res.json())
            .then(data => {
                const projectsList = data.projects || []
                setProjects(projectsList)
                // Auto-select current project from context
                if (contextProject) {
                    const match = projectsList.find((p: Project) => p.name === contextProject.name)
                    if (match) {
                        setSelectedProject(match.path)
                    }
                }
            })
            .catch(console.error)
    }, [contextProject])

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (query.trim()) {
            const projectPath = selectedProject !== '__all__' ? selectedProject : undefined
            onSearch(query, semanticWeight, projectPath)
        }
    }

    const modes = [
        { value: 0, icon: Zap, label: t('searchBar.keywords'), description: t('searchBar.keywordsDesc') },
        { value: 0.5, icon: Search, label: t('searchBar.hybrid'), description: t('searchBar.hybridDesc') },
        { value: 1, icon: Sparkles, label: t('searchBar.semantic'), description: t('searchBar.semanticDesc') },
    ]

    return (
        <div className="space-y-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
                {/* Project Selector — hidden when only current project exists */}
                {projects.length > 1 && (
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                        <SelectTrigger className="w-48 h-12">
                            <FolderOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                            <SelectValue placeholder={t('searchBar.allProjects')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">{t('searchBar.allProjects')}</SelectItem>
                            {projects.map(p => (
                                <SelectItem key={p.path} value={p.path}>
                                    {p.name} ({p.file_count})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        data-search
                        placeholder={t('searchBar.placeholder')}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="pl-10 h-12 text-base bg-card border-border"
                        disabled={disabled}
                    />
                </div>
                <Button type="submit" size="lg" disabled={!query.trim() || isLoading || disabled} className="h-12 px-6">
                    {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        t('searchBar.search')
                    )}
                </Button>
            </form>

            {/* Search Mode Selector */}
            <div className="flex gap-2">
                {modes.map((mode) => {
                    const Icon = mode.icon
                    const isActive = semanticWeight === mode.value
                    return (
                        <button
                            key={mode.value}
                            type="button"
                            onClick={() => setSemanticWeight(mode.value)}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                                isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            <span className="font-medium">{mode.label}</span>
                            <span className="text-xs opacity-75 hidden sm:inline">
                                {mode.description}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

