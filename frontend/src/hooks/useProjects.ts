import { useState, useEffect, useCallback } from 'react'
import { API_BASE } from '@/lib/api'

export interface Project {
    name: string
    path: string
    file_count: number
    total_size_bytes: number
    last_modified: string | null
    subdirectories: number
}

export interface ProjectsData {
    projects: Project[]
    documents_path: string
    total_projects: number
}

export function useProjects() {
    const [data, setData] = useState<ProjectsData | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedProject, setSelectedProject] = useState<Project | null>(null)

    const fetchProjects = useCallback(async () => {
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch(`${API_BASE}/projects/`)
            if (!response.ok) throw new Error('Failed to fetch projects')
            
            const result: ProjectsData = await response.json()
            setData(result)
            
            // Auto-select first project if only one exists
            if (result.projects.length === 1) {
                setSelectedProject(result.projects[0])
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchProjects()
    }, [fetchProjects])

    return {
        projects: data?.projects || [],
        documentsPath: data?.documents_path || '/documents',
        totalProjects: data?.total_projects || 0,
        isLoading,
        error,
        selectedProject,
        setSelectedProject,
        refetch: fetchProjects
    }
}
