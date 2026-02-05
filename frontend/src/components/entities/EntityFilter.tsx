import { useState } from 'react'
import { Users, Building2, MapPin, Hash } from 'lucide-react'
import { useEntities } from '@/hooks/useEntities'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

interface EntityFilterProps {
    onEntitySelect?: (text: string, type: string) => void
    selectedEntity?: string | null
    className?: string
}

// Entity type config
const ENTITY_TYPES = {
    PER: { label: 'Personnes', icon: Users, color: 'text-blue-400 bg-blue-400/10' },
    ORG: { label: 'Organisations', icon: Building2, color: 'text-green-400 bg-green-400/10' },
    LOC: { label: 'Lieux', icon: MapPin, color: 'text-orange-400 bg-orange-400/10' },
    MISC: { label: 'Divers', icon: Hash, color: 'text-purple-400 bg-purple-400/10' },
} as const

type EntityType = keyof typeof ENTITY_TYPES

export function EntityFilter({ 
    onEntitySelect, 
    selectedEntity,
    className 
}: EntityFilterProps) {
    const [activeType, setActiveType] = useState<EntityType | null>(null)
    const { entities, typeSummary, isLoading } = useEntities({
        entityType: activeType || undefined,
        limit: 30
    })

    const getTypeCount = (type: string): number => {
        const summary = typeSummary.find(t => t.type === type)
        return summary?.unique_count || 0
    }

    if (isLoading && !entities.length) {
        return (
            <div className={cn("p-4 text-sm text-muted-foreground", className)}>
                Chargement entités...
            </div>
        )
    }

    if (!typeSummary.length) {
        return null // Hide if no entities
    }

    return (
        <div className={cn("space-y-3", className)}>
            {/* Type Filters */}
            <div className="flex flex-wrap gap-1">
                {(Object.keys(ENTITY_TYPES) as EntityType[]).map(type => {
                    const config = ENTITY_TYPES[type]
                    const count = getTypeCount(type)
                    if (count === 0) return null

                    const Icon = config.icon
                    const isActive = activeType === type

                    return (
                        <Button
                            key={type}
                            variant={isActive ? "default" : "outline"}
                            size="sm"
                            onClick={() => setActiveType(isActive ? null : type)}
                            className="h-7 text-xs gap-1"
                        >
                            <Icon className="h-3 w-3" />
                            {config.label}
                            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                                {count}
                            </Badge>
                        </Button>
                    )
                })}
            </div>

            {/* Entity List */}
            {entities.length > 0 && (
                <ScrollArea className="h-48">
                    <div className="space-y-1">
                        {entities.map((entity, idx) => {
                            const config = ENTITY_TYPES[entity.type as EntityType]
                            const isSelected = selectedEntity === entity.text

                            return (
                                <button
                                    key={`${entity.type}-${entity.text}-${idx}`}
                                    onClick={() => onEntitySelect?.(entity.text, entity.type)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-2 py-1.5 rounded text-sm",
                                        "hover:bg-accent transition-colors text-left",
                                        isSelected && "bg-accent"
                                    )}
                                >
                                    <span className="truncate">{entity.text}</span>
                                    <div className="flex items-center gap-2 ml-2">
                                        <Badge 
                                            variant="outline" 
                                            className={cn("text-[10px] h-4 px-1", config?.color)}
                                        >
                                            {entity.type}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {entity.document_count}
                                        </span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </ScrollArea>
            )}
        </div>
    )
}
