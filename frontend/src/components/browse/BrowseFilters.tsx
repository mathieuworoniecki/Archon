import { FileText, Image, FileType2, Calendar, SortDesc } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FileType, SortBy } from '@/lib/api'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface BrowseFiltersProps {
    activeFileTypes: FileType[]
    sortBy: SortBy
    dateRange?: { from?: string; to?: string }
    onToggleFileType: (type: FileType) => void
    onSetDateRange: (from?: string, to?: string) => void
    onSetSortBy: (sort: SortBy) => void
    onClear: () => void
    documentsByType?: { pdf: number; image: number; text: number; unknown: number }
}

const FILE_TYPE_CONFIG: { type: FileType; label: string; icon: React.ElementType; color: string }[] = [
    { type: 'pdf', label: 'PDF', icon: FileText, color: 'text-red-500' },
    { type: 'image', label: 'Images', icon: Image, color: 'text-blue-500' },
    { type: 'text', label: 'Texte', icon: FileType2, color: 'text-green-500' },
]

const DATE_PRESETS = [
    { label: "Aujourd'hui", days: 0 },
    { label: '7 derniers jours', days: 7 },
    { label: '30 derniers jours', days: 30 },
    { label: 'Cette année', days: 365 },
]

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
    { value: 'indexed_desc', label: 'Date indexation ↓' },
    { value: 'indexed_asc', label: 'Date indexation ↑' },
    { value: 'modified_desc', label: 'Date modification ↓' },
    { value: 'modified_asc', label: 'Date modification ↑' },
    { value: 'name_asc', label: 'Nom A → Z' },
    { value: 'name_desc', label: 'Nom Z → A' },
    { value: 'size_desc', label: 'Taille ↓' },
    { value: 'size_asc', label: 'Taille ↑' },
]

export function BrowseFilters({
    activeFileTypes,
    sortBy,
    dateRange,
    onToggleFileType,
    onSetDateRange,
    onSetSortBy,
    onClear,
    documentsByType
}: BrowseFiltersProps) {

    const getDateFromDays = (days: number): string => {
        const date = new Date()
        date.setDate(date.getDate() - days)
        return date.toISOString()
    }

    const handleDatePreset = (days: number) => {
        if (days === 0) {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            onSetDateRange(today.toISOString(), undefined)
        } else {
            onSetDateRange(getDateFromDays(days), undefined)
        }
    }

    const hasActiveFilters = activeFileTypes.length > 0 || dateRange?.from || dateRange?.to

    const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? 'Trier'

    return (
        <div className="flex flex-wrap items-center gap-2 p-4 border-b bg-card/30">
            {/* File Type Chips */}
            <div className="flex items-center gap-1">
                {FILE_TYPE_CONFIG.map(({ type, label, icon: Icon, color }) => {
                    const isActive = activeFileTypes.includes(type)
                    const count = documentsByType?.[type] ?? 0

                    return (
                        <Button
                            key={type}
                            variant={isActive ? "default" : "outline"}
                            size="sm"
                            onClick={() => onToggleFileType(type)}
                            className={cn(
                                "gap-1.5 h-8",
                                isActive && "bg-primary"
                            )}
                        >
                            <Icon className={cn("h-3.5 w-3.5", !isActive && color)} />
                            <span>{label}</span>
                            {count > 0 && (
                                <span className={cn(
                                    "text-xs px-1.5 py-0.5 rounded-full",
                                    isActive ? "bg-primary-foreground/20" : "bg-muted"
                                )}>
                                    {count}
                                </span>
                            )}
                        </Button>
                    )
                })}
            </div>

            <div className="w-px h-6 bg-border mx-2" />

            {/* Date Presets */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-8">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{dateRange?.from ? 'Période active' : 'Date'}</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    {DATE_PRESETS.map(({ label, days }) => (
                        <DropdownMenuItem key={days} onClick={() => handleDatePreset(days)}>
                            {label}
                        </DropdownMenuItem>
                    ))}
                    {dateRange?.from && (
                        <>
                            <DropdownMenuItem onClick={() => onSetDateRange(undefined, undefined)}>
                                × Effacer la date
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort Options */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5 h-8">
                        <SortDesc className="h-3.5 w-3.5" />
                        <span>{currentSortLabel}</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    {SORT_OPTIONS.map(({ value, label }) => (
                        <DropdownMenuItem
                            key={value}
                            onClick={() => onSetSortBy(value)}
                            className={cn(sortBy === value && "bg-accent")}
                        >
                            {label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Clear Filters */}
            {hasActiveFilters && (
                <>
                    <div className="w-px h-6 bg-border mx-2" />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClear}
                        className="h-8 text-muted-foreground hover:text-foreground"
                    >
                        × Effacer les filtres
                    </Button>
                </>
            )}
        </div>
    )
}
