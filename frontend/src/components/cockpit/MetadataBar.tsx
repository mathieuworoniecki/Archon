import { FileText, Tag, Users, Building2, MapPin } from 'lucide-react'
import { useCockpit } from '@/contexts/CockpitContext'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useEntities } from '@/hooks/useEntities'
import { useTranslation } from '@/contexts/I18nContext'

interface MetadataBarProps {
    className?: string
}

const ENTITY_ICONS = {
    PER: Users,
    ORG: Building2,
    LOC: MapPin,
} as const

export function MetadataBar({ className }: MetadataBarProps) {
    const { selectedResult, selectedDocumentId } = useCockpit()
    const { entities } = useEntities()
    const { t } = useTranslation()

    // Get entities for selected document
    const documentEntities = selectedDocumentId 
        ? entities.filter(e => e.document_count > 0).slice(0, 10)
        : []

    if (!selectedResult) {
        return (
            <div className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}>
                {t('metadata.selectDocument')}
            </div>
        )
    }

    return (
        <div className={cn("flex items-center gap-6 px-4", className)}>
            {/* File Info */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium truncate max-w-48">
                        {selectedResult.file_name}
                    </span>
                </div>

                <Badge variant="outline" className="text-xs">
                    {selectedResult.file_type.toUpperCase()}
                </Badge>
            </div>

            {/* Separator */}
            <div className="h-6 w-px bg-border" />

            {/* Entities */}
            <div className="flex items-center gap-2 flex-1 overflow-hidden">
                <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-1 overflow-x-auto">
                    {documentEntities.length > 0 ? (
                        documentEntities.map((entity, idx) => {
                            const Icon = ENTITY_ICONS[entity.type as keyof typeof ENTITY_ICONS]
                            return (
                                <Badge 
                                    key={`${entity.type}-${entity.text}-${idx}`}
                                    variant="secondary"
                                    className="text-xs shrink-0 gap-1"
                                >
                                    {Icon && <Icon className="h-3 w-3" />}
                                    {entity.text}
                                </Badge>
                            )
                        })
                    ) : (
                        <span className="text-xs text-muted-foreground">{t('metadata.noEntities')}</span>
                    )}
                </div>
            </div>

            {/* Score */}
            {selectedResult.score !== undefined && (
                <div className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground">{t('metadata.score')}:</span>
                    <span className="font-mono font-medium">
                        {(selectedResult.score * 100).toFixed(0)}%
                    </span>
                </div>
            )}
        </div>
    )
}
