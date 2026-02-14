import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '@/lib/api'
import { authFetch } from '@/lib/auth'
import { useProject } from '@/contexts/ProjectContext'

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
    projectPath?: string
}

export function useEntities(options: UseEntitiesOptions = {}) {
    const { selectedProject } = useProject()
    const [entities, setEntities] = useState<EntityAggregation[]>([])
    const [typeSummary, setTypeSummary] = useState<EntityTypeSummary[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { entityType, search, limit = 50 } = options
    const projectPath = options.projectPath ?? selectedProject?.path

    const fetchEntities = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams()
            if (entityType) params.set('entity_type', entityType)
            if (search) params.set('search', search)
            params.set('limit', limit.toString())
            if (projectPath) params.set('project_path', projectPath)

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
            const params = new URLSearchParams()
            if (projectPath) params.set('project_path', projectPath)

            const response = await authFetch(`${API_BASE}/entities/types?${params}`)
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
        searchLimit: number = 20,
        opts?: { exact?: boolean }
    ): Promise<EntityDocument[]> => {
        const params = new URLSearchParams()
        params.set('text', text)
        if (type) params.set('entity_type', type)
        params.set('limit', searchLimit.toString())
        if (projectPath) params.set('project_path', projectPath)
        params.set('exact', String(opts?.exact ?? true))

        const response = await authFetch(`${API_BASE}/entities/search?${params}`)
        if (!response.ok) throw new Error('Failed to search by entity')
        return response.json()
    }, [projectPath])

    const lookupEntity = useCallback(async (text: string, type: string): Promise<EntityAggregation> => {
        const params = new URLSearchParams()
        params.set('text', text)
        params.set('entity_type', type)
        if (projectPath) params.set('project_path', projectPath)

        const response = await authFetch(`${API_BASE}/entities/lookup?${params}`)
        if (!response.ok) throw new Error('Failed to lookup entity')
        return response.json()
    }, [projectPath])

    const getCooccurrences = useCallback(async (
        text: string,
        type: string,
        coLimit: number = 5,
    ): Promise<Array<{ text: string; type: string; weight: number }>> => {
        const params = new URLSearchParams()
        params.set('text', text)
        params.set('entity_type', type)
        params.set('limit', String(coLimit))
        if (projectPath) params.set('project_path', projectPath)

        const response = await authFetch(`${API_BASE}/entities/cooccurrences?${params}`)
        if (!response.ok) throw new Error('Failed to fetch co-occurrences')
        return response.json()
    }, [projectPath])

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
        searchDocumentsByEntity,
        lookupEntity,
        getCooccurrences,
    }
}
