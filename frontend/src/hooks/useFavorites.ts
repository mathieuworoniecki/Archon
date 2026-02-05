import { useState, useCallback, useEffect } from 'react'
import {
    checkFavoriteStatus, addFavorite, removeFavorite,
    getFavorites, Favorite
} from '@/lib/api'

interface UseFavoriteProps {
    documentId: number | null
}

export function useFavorite({ documentId }: UseFavoriteProps) {
    const [isFavorite, setIsFavorite] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [favoriteId, setFavoriteId] = useState<number | null>(null)

    // Check status when documentId changes
    useEffect(() => {
        if (!documentId) {
            setIsFavorite(false)
            setFavoriteId(null)
            return
        }

        const checkStatus = async () => {
            try {
                const status = await checkFavoriteStatus(documentId)
                setIsFavorite(status.is_favorite)
                setFavoriteId(status.favorite_id)
            } catch {
                setIsFavorite(false)
                setFavoriteId(null)
            }
        }

        checkStatus()
    }, [documentId])

    const toggleFavorite = useCallback(async () => {
        if (!documentId || isLoading) return

        setIsLoading(true)

        try {
            if (isFavorite) {
                await removeFavorite(documentId)
                setIsFavorite(false)
                setFavoriteId(null)
            } else {
                const fav = await addFavorite(documentId)
                setIsFavorite(true)
                setFavoriteId(fav.id)
            }
        } catch (err) {
            console.error('Failed to toggle favorite:', err)
        } finally {
            setIsLoading(false)
        }
    }, [documentId, isFavorite, isLoading])

    return {
        isFavorite,
        isLoading,
        favoriteId,
        toggleFavorite
    }
}

// Hook for managing favorites list
export function useFavorites() {
    const [favorites, setFavorites] = useState<Favorite[]>([])
    const [total, setTotal] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchFavorites = useCallback(async (tagIds?: number[]) => {
        setIsLoading(true)
        setError(null)

        try {
            const response = await getFavorites(tagIds)
            setFavorites(response.favorites)
            setTotal(response.total)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch favorites')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchFavorites()
    }, [])

    return {
        favorites,
        total,
        isLoading,
        error,
        refetch: fetchFavorites
    }
}
