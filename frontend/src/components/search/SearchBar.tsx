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

    // Fetch projects on mount
    useEffect(() => {
        fetch(`${API_BASE}/projects/`)
            .then(res => res.json())
            .then(data => setProjects(data.projects || []))
            .catch(console.error)
    }, [])

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (query.trim()) {
            const projectPath = selectedProject !== '__all__' ? selectedProject : undefined
            onSearch(query, semanticWeight, projectPath)
        }
    }

    const modes = [
        { value: 0, icon: Zap, label: 'Mots-clés', description: 'Recherche exacte' },
        { value: 0.5, icon: Search, label: 'Hybride', description: 'Meilleur des deux' },
        { value: 1, icon: Sparkles, label: 'Sémantique', description: 'Recherche IA' },
    ]

    return (
        <div className="space-y-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
                {/* Project Selector */}
                {projects.length > 0 && (
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                        <SelectTrigger className="w-48 h-12">
                            <FolderOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                            <SelectValue placeholder="Tous les projets" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">Tous les projets</SelectItem>
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
                        type="text"
                        placeholder="Rechercher dans les documents..."
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
                        'Rechercher'
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

