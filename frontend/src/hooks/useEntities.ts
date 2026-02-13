import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '@/lib/api'
import { authFetch } from '@/lib/auth'

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

export interface EntityDocument {
    document_id: number
    file_name: string
    file_path: string
    entity_count: number
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

            const response = await authFetch(`${API_BASE}/entities/?${params}`)
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
            const response = await authFetch(`${API_BASE}/entities/types`)
            if (!response.ok) throw new Error('Failed to fetch entity types')
            
            const result = await response.json()
            setTypeSummary(result)
        } catch {
            // non-critical: type summary is optional UI enhancement
        }
    }, [])

    const searchDocumentsByEntity = useCallback(async (
        text: string,
        type?: string,
        searchLimit: number = 20
    ): Promise<EntityDocument[]> => {
        const params = new URLSearchParams()
        params.set('text', text)
        if (type) params.set('entity_type', type)
        params.set('limit', searchLimit.toString())

        const response = await authFetch(`${API_BASE}/entities/search?${params}`)
        if (!response.ok) throw new Error('Failed to search by entity')
        return response.json()
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
        refetch: fetchEntities,
        searchDocumentsByEntity
    }
}
