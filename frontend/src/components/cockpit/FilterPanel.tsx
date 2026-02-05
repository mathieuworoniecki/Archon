import { Search } from 'lucide-react'
import { useCockpit } from '@/contexts/CockpitContext'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { EntityFilter } from '@/components/entities/EntityFilter'
import { cn } from '@/lib/utils'
import { FileType } from '@/lib/api'

interface FilterPanelProps {
    className?: string
    onSearch: () => void
}

const FILE_TYPE_OPTIONS = [
    { value: 'pdf', label: 'PDF' },
    { value: 'image', label: 'Images' },
    { value: 'text', label: 'Texte' },
]

export function FilterPanel({ className, onSearch }: FilterPanelProps) {
    const { filters, updateFilters, isLoading } = useCockpit()

    const handleSearch = () => {
        if (filters.query.trim()) {
            onSearch()
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch()
        }
    }

    const toggleFileType = (type: FileType) => {
        const current = filters.fileTypes
        const newTypes = current.includes(type)
            ? current.filter(t => t !== type)
            : [...current, type]
        updateFilters({ fileTypes: newTypes })
    }

    const handleEntitySelect = (text: string, _type: string) => {
        updateFilters({ selectedEntity: text })
    }

    return (
        <div className={cn("flex flex-col h-full", className)}>
            {/* Search */}
            <div className="p-3 border-b space-y-3">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Rechercher..."
                        value={filters.query}
                        onChange={(e) => updateFilters({ query: e.target.value })}
                        onKeyDown={handleKeyDown}
                        className="pl-8"
                    />
                </div>
                <Button 
                    onClick={handleSearch} 
                    className="w-full"
                    disabled={isLoading || !filters.query.trim()}
                >
                    {isLoading ? 'Recherche...' : 'Rechercher'}
                </Button>
            </div>

            {/* Semantic Weight - Simple buttons */}
            <div className="p-3 border-b space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                    Mode de recherche
                </label>
                <div className="flex gap-1">
                    <Button
                        variant={filters.semanticWeight < 0.3 ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateFilters({ semanticWeight: 0 })}
                        className="text-xs flex-1"
                    >
                        Texte
                    </Button>
                    <Button
                        variant={filters.semanticWeight >= 0.3 && filters.semanticWeight <= 0.7 ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateFilters({ semanticWeight: 0.5 })}
                        className="text-xs flex-1"
                    >
                        Hybride
                    </Button>
                    <Button
                        variant={filters.semanticWeight > 0.7 ? "default" : "outline"}
                        size="sm"
                        onClick={() => updateFilters({ semanticWeight: 1 })}
                        className="text-xs flex-1"
                    >
                        Sémantique
                    </Button>
                </div>
            </div>

            {/* File Types */}
            <div className="p-3 border-b">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Types de fichiers
                </label>
                <div className="flex flex-wrap gap-1">
                    {FILE_TYPE_OPTIONS.map(opt => (
                        <Button
                            key={opt.value}
                            variant={filters.fileTypes.includes(opt.value as FileType) ? "default" : "outline"}
                            size="sm"
                            onClick={() => toggleFileType(opt.value as FileType)}
                            className="text-xs h-7"
                        >
                            {opt.label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Entities */}
            <div className="flex-1 overflow-auto p-3">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    Entités
                </label>
                <EntityFilter 
                    onEntitySelect={handleEntitySelect}
                    selectedEntity={filters.selectedEntity}
                />
            </div>
        </div>
    )
}
