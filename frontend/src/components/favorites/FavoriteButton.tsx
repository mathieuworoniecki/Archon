import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFavorite } from '@/hooks/useFavorites'
import { cn } from '@/lib/utils'

interface FavoriteButtonProps {
    documentId: number | null
    size?: 'sm' | 'default' | 'lg'
    variant?: 'ghost' | 'outline'
    showLabel?: boolean
    className?: string
}

export function FavoriteButton({
    documentId,
    size = 'default',
    variant = 'ghost',
    showLabel = false,
    className
}: FavoriteButtonProps) {
    const { isFavorite, isLoading, toggleFavorite } = useFavorite({ documentId })

    if (!documentId) return null

    const iconSize = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'

    return (
        <Button
            variant={variant}
            size={size}
            onClick={(e) => {
                e.stopPropagation()
                toggleFavorite()
            }}
            disabled={isLoading}
            className={cn(
                "transition-all duration-200",
                isFavorite && "text-yellow-500 hover:text-yellow-600",
                className
            )}
            title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        >
            <Star
                className={cn(
                    iconSize,
                    "transition-transform duration-200",
                    isFavorite && "fill-current scale-110",
                    isLoading && "animate-pulse"
                )}
            />
            {showLabel && (
                <span className="ml-1.5">
                    {isFavorite ? "Favori" : "Ajouter"}
                </span>
            )}
        </Button>
    )
}
