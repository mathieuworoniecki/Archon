import { useState, useEffect, FormEvent, useCallback } from 'react'
import { Search, Sparkles, Zap, Loader2, FolderOpen, FileText, Image, FileCode, Video, Mail, FileQuestion, AlertTriangle, RefreshCw } from 'lucide-react'
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
import { useTranslation } from '@/contexts/I18nContext'
import { useProject } from '@/contexts/ProjectContext'
import { getSearchFacets, type SearchFacets } from '@/lib/api'

export interface SearchOptions {
    file_types?: string[]
    limit?: number
}

interface SearchBarProps {
    onSearch: (query: string, semanticWeight: number, projectPath?: string, options?: SearchOptions) => void
    isLoading?: boolean
    disabled?: boolean
    initialQuery?: string
    /** Initial file type filters (e.g. from URL ?types=pdf,image) */
    initialFileTypes?: string[]
}

const STATIC_TYPES = [
    { value: 'pdf', label: 'PDF', icon: FileText },
    { value: 'image', label: 'Image', icon: Image },
    { value: 'text', label: 'Texte', icon: FileCode },
    { value: 'video', label: 'Vidéo', icon: Video },
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'unknown', label: 'Autres', icon: FileQuestion },
] as const

export function SearchBar({ onSearch, isLoading, disabled, initialQuery, initialFileTypes }: SearchBarProps) {
    const [query, setQuery] = useState('')
    const [semanticWeight, setSemanticWeight] = useState(0.5)
    const [selectedProject, setSelectedProject] = useState<string>('__all__')
    const [fileTypes, setFileTypes] = useState<string[]>([])
    const [facets, setFacets] = useState<SearchFacets | null>(null)
    const [facetsError, setFacetsError] = useState(false)
    const { t } = useTranslation()
    const { selectedProject: contextProject, projects } = useProject()

    useEffect(() => {
        if (contextProject?.path) {
            setSelectedProject(contextProject.path)
        }
    }, [contextProject?.path])

    useEffect(() => {
        if (typeof initialQuery === 'string') {
            setQuery(initialQuery)
        }
    }, [initialQuery])

    useEffect(() => {
        if (Array.isArray(initialFileTypes) && initialFileTypes.length > 0) {
            setFileTypes(initialFileTypes.map((t) => t.toLowerCase()))
        }
    }, [initialFileTypes?.join(',')])

    const projectPathForFacets = selectedProject !== '__all__' ? selectedProject : undefined

    const fetchFacets = useCallback(() => {
        if (disabled) return
        setFacetsError(false)
        getSearchFacets(projectPathForFacets)
            .then((data) => setFacets(data))
            .catch(() => { setFacets(null); setFacetsError(true) })
    }, [projectPathForFacets, disabled])

    useEffect(() => { fetchFacets() }, [fetchFacets])

    const toggleFileType = useCallback((value: string) => {
        setFileTypes((prev) =>
            prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
        )
    }, [])

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault()
        if (query.trim()) {
            const projectPath = selectedProject !== '__all__' ? selectedProject : undefined
            onSearch(query, semanticWeight, projectPath, {
                file_types: fileTypes.length > 0 ? fileTypes : undefined,
            })
        }
    }

    const modes = [
        { value: 0, icon: Zap, label: t('searchBar.keywords'), description: t('searchBar.keywordsDesc') },
        { value: 0.5, icon: Search, label: t('searchBar.hybrid'), description: t('searchBar.hybridDesc') },
        { value: 1, icon: Sparkles, label: t('searchBar.semantic'), description: t('searchBar.semanticDesc') },
    ]

    const typeChunks = facets?.file_types?.length
        ? facets.file_types
              .filter((f) => f.count > 0)
              .map((f) => ({
                  value: f.value.toLowerCase(),
                  label: f.value.toLowerCase() === 'pdf' ? 'PDF' : f.value.charAt(0).toUpperCase() + f.value.slice(1).toLowerCase(),
                  count: f.count,
                  icon: STATIC_TYPES.find((s) => s.value === f.value.toLowerCase())?.icon ?? FileText,
              }))
        : STATIC_TYPES.map((s) => ({ ...s, count: null as number | null }))

    return (
        <div className="space-y-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
                {projects.length > 1 && (
                    <Select value={selectedProject} onValueChange={setSelectedProject}>
                        <SelectTrigger className="w-48 h-12">
                            <FolderOpen className="h-4 w-4 mr-2 text-muted-foreground" />
                            <SelectValue placeholder={t('searchBar.allProjects')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">{t('searchBar.allProjects')}</SelectItem>
                            {projects.map((p) => (
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

            <div className="flex flex-wrap items-center gap-2">
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
                            <span className="text-xs opacity-75 hidden sm:inline">{mode.description}</span>
                        </button>
                    )
                })}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border/50">
                <span className="text-xs font-medium text-muted-foreground">{t('searchBar.filterByType')}</span>
                <div className="flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        onClick={() => setFileTypes([])}
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                            fileTypes.length === 0
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background hover:bg-muted border-border'
                        )}
                    >
                        {t('searchBar.allTypes')}
                    </button>
                    {typeChunks.map(({ value, label, count, icon: Icon }) => {
                        const isSelected = fileTypes.includes(value)
                        return (
                            <button
                                key={value}
                                type="button"
                                onClick={() => toggleFileType(value)}
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                    isSelected
                                        ? 'bg-primary/15 text-primary border-primary/50'
                                        : 'bg-background hover:bg-muted border-border'
                                )}
                            >
                                <Icon className="h-3 w-3" />
                                {label}
                                {count != null && (
                                    <span className="text-muted-foreground tabular-nums">({count.toLocaleString()})</span>
                                )}
                            </button>
                        )
                    })}
                    {facetsError && (
                        <button
                            type="button"
                            onClick={fetchFacets}
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500 hover:bg-amber-500/20 transition-colors"
                        >
                            <AlertTriangle className="h-3 w-3" />
                            {t('searchBar.facetsUnavailable')}
                            <RefreshCw className="h-3 w-3" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

