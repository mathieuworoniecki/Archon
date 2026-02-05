import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '@/lib/api'

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

            const response = await fetch(`${API_BASE}/timeline/aggregation?${params}`)
            if (!response.ok) throw new Error('Failed to fetch timeline')
            
            const result = await response.json()
            setData(result)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setIsLoading(false)
        }
    }, [granularity, scanId])

    const fetchRange = useCallback(async () => {
        try {
            const params = new URLSearchParams()
            if (scanId) params.set('scan_id', scanId.toString())

            const response = await fetch(`${API_BASE}/timeline/range?${params}`)
            if (!response.ok) throw new Error('Failed to fetch range')
            
            const result = await response.json()
            setRange(result)
        } catch (err) {
            console.error('Failed to fetch timeline range:', err)
        }
    }, [scanId])

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
