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

export interface TimelineQuality {
    total_documents: number
    intrinsic_documents: number
    intrinsic_share: number
    fallback_documents: number
    sources: Array<{ source: string; count: number }>
}

interface UseTimelineOptions {
    granularity?: 'day' | 'week' | 'month' | 'year'
    scanId?: number
    enabled?: boolean
    fileTypes?: Array<'pdf' | 'image' | 'text' | 'video' | 'email' | 'unknown'>
}

export function useTimeline(options: UseTimelineOptions = {}) {
    const { selectedProject } = useProject()
    const [data, setData] = useState<TimelineData | null>(null)
    const [range, setRange] = useState<TimelineRange | null>(null)
    const [quality, setQuality] = useState<TimelineQuality | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { granularity = 'month', scanId, enabled = true, fileTypes } = options

    const fetchTimeline = useCallback(async () => {
        if (!enabled) return
        setIsLoading(true)
        setError(null)

        try {
            const params = new URLSearchParams()
            params.set('granularity', granularity)
            if (scanId) params.set('scan_id', scanId.toString())
            if (selectedProject?.path) params.set('project_path', selectedProject.path)
            if (fileTypes?.length) {
                fileTypes.forEach((type) => params.append('file_types', type))
            }

            const response = await authFetch(`${API_BASE}/timeline/aggregation?${params}`)
            if (!response.ok) throw new Error('Failed to fetch timeline')
            
            const result = await response.json()
            setData(result)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setIsLoading(false)
        }
    }, [enabled, granularity, scanId, selectedProject?.path, fileTypes])

    const fetchRange = useCallback(async () => {
        if (!enabled) return
        try {
            const params = new URLSearchParams()
            if (scanId) params.set('scan_id', scanId.toString())
            if (selectedProject?.path) params.set('project_path', selectedProject.path)
            if (fileTypes?.length) {
                fileTypes.forEach((type) => params.append('file_types', type))
            }

            const response = await authFetch(`${API_BASE}/timeline/range?${params}`)
            if (!response.ok) throw new Error('Failed to fetch range')
            
            const result = await response.json()
            setRange(result)
        } catch {
            // non-critical: range info supplements the timeline
        }
    }, [enabled, scanId, selectedProject?.path, fileTypes])

    const fetchQuality = useCallback(async () => {
        if (!enabled) return
        try {
            const params = new URLSearchParams()
            if (scanId) params.set('scan_id', scanId.toString())
            if (selectedProject?.path) params.set('project_path', selectedProject.path)
            if (fileTypes?.length) {
                fileTypes.forEach((type) => params.append('file_types', type))
            }

            const response = await authFetch(`${API_BASE}/timeline/quality?${params}`)
            if (!response.ok) throw new Error('Failed to fetch quality')

            const result = await response.json()
            setQuality(result)
        } catch {
            // non-critical: quality is informational and depends on DB columns being present
            setQuality(null)
        }
    }, [enabled, scanId, selectedProject?.path, fileTypes])

    useEffect(() => {
        if (!enabled) {
            setIsLoading(false)
            return
        }
        fetchTimeline()
        fetchRange()
        fetchQuality()
    }, [enabled, fetchTimeline, fetchRange, fetchQuality])

    return {
        data,
        range,
        quality,
        isLoading,
        error,
        refetch: async () => {
            await fetchTimeline()
            fetchRange()
            fetchQuality()
        }
    }
}
