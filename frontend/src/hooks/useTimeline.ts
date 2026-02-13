import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '@/lib/api'
import { authFetch } from '@/lib/auth'
import { useProject } from '@/contexts/ProjectContext'

export interface TimelineDataPoint {
    date: string
    count: number
    by_type: Record<string, number>
}

export interface TimelineData {
    granularity: string
    date_from: string | null
    date_to: string | null
    total_documents: number
    data: TimelineDataPoint[]
}

export interface TimelineRange {
    min_date: string | null
    max_date: string | null
    total_documents: number
}

interface UseTimelineOptions {
    granularity?: 'day' | 'week' | 'month' | 'year'
    scanId?: number
}

export function useTimeline(options: UseTimelineOptions = {}) {
    const { selectedProject } = useProject()
    const [data, setData] = useState<TimelineData | null>(null)
    const [range, setRange] = useState<TimelineRange | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { granularity = 'month', scanId } = options

    const fetchTimeline = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams()
            params.set('granularity', granularity)
            if (scanId) params.set('scan_id', scanId.toString())
            if (selectedProject?.path) params.set('project_path', selectedProject.path)

            const response = await authFetch(`${API_BASE}/timeline/aggregation?${params}`)
            if (!response.ok) throw new Error('Failed to fetch timeline')
            
            const result = await response.json()
            setData(result)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setIsLoading(false)
        }
    }, [granularity, scanId, selectedProject?.path])

    const fetchRange = useCallback(async () => {
        try {
            const params = new URLSearchParams()
            if (scanId) params.set('scan_id', scanId.toString())
            if (selectedProject?.path) params.set('project_path', selectedProject.path)

            const response = await authFetch(`${API_BASE}/timeline/range?${params}`)
            if (!response.ok) throw new Error('Failed to fetch range')
            
            const result = await response.json()
            setRange(result)
        } catch {
            // non-critical: range info supplements the timeline
        }
    }, [scanId, selectedProject?.path])

    useEffect(() => {
        fetchTimeline()
        fetchRange()
    }, [fetchTimeline, fetchRange])

    return {
        data,
        range,
        isLoading,
        error,
        refetch: fetchTimeline
    }
}
