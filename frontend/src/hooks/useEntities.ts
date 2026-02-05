import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '@/lib/api'

export interface EntityAggregation {
    text: string
    type: string
    total_count: number
    document_count: number
}

export interface EntityTypeSummary {
    type: string
    count: number
    unique_count: number
}

interface UseEntitiesOptions {
    entityType?: 'PER' | 'ORG' | 'LOC' | 'MISC' | 'DATE'
    search?: string
    limit?: number
}

export function useEntities(options: UseEntitiesOptions = {}) {
    const [entities, setEntities] = useState<EntityAggregation[]>([])
    const [typeSummary, setTypeSummary] = useState<EntityTypeSummary[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { entityType, search, limit = 50 } = options

    const fetchEntities = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams()
            if (entityType) params.set('entity_type', entityType)
            if (search) params.set('search', search)
            params.set('limit', limit.toString())

            const response = await fetch(`${API_BASE}/entities/?${params}`)
            if (!response.ok) throw new Error('Failed to fetch entities')
            
            const result = await response.json()
            setEntities(result)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setIsLoading(false)
        }
    }, [entityType, search, limit])

    const fetchTypeSummary = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE}/entities/types`)
            if (!response.ok) throw new Error('Failed to fetch entity types')
            
            const result = await response.json()
            setTypeSummary(result)
        } catch (err) {
            console.error('Failed to fetch entity types:', err)
        }
    }, [])

    useEffect(() => {
        fetchEntities()
        fetchTypeSummary()
    }, [fetchEntities, fetchTypeSummary])

    return {
        entities,
        typeSummary,
        isLoading,
        error,
        refetch: fetchEntities
    }
}
