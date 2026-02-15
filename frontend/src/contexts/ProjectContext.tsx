/**
 * ProjectContext — Global project selection state.
 * Persists selected project in sessionStorage so navigation within
 * the app keeps the project context alive.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { API_BASE } from '@/lib/api'
import { authFetch } from '@/lib/auth'
import { usePersistedQuery } from '@/hooks/usePersistedQuery'

export interface Project {
    name: string
    path: string
    file_count: number
    file_count_estimated?: boolean
    total_size_bytes: number
    last_modified: string | null
    subdirectories: number
}

interface ProjectContextValue {
    /** Currently selected project (null = no project, show dashboard) */
    selectedProject: Project | null
    /** Select a project and enter the app */
    selectProject: (project: Project) => void
    /** Clear selection and go back to dashboard */
    clearProject: () => void
    /** All available projects */
    projects: Project[]
    /** Documents root path */
    documentsPath: string
    /** Loading state */
    isLoading: boolean
    /** Refetch project list */
    refetchProjects: () => Promise<void>
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

const STORAGE_KEY = 'archon_selected_project'
const PROJECTS_CACHE_KEY = 'archon_projects_cache_v1'

interface ProjectsResponsePayload {
    projects: Project[]
    documents_path: string
}

export function ProjectProvider({ children }: { children: ReactNode }) {
    const [selectedProject, setSelectedProject] = useState<Project | null>(() => {
        try {
            const stored = sessionStorage.getItem(STORAGE_KEY)
            return stored ? JSON.parse(stored) : null
        } catch {
            return null
        }
    })
    const fetchProjects = useCallback(async (): Promise<ProjectsResponsePayload> => {
        const response = await authFetch(`${API_BASE}/projects/`)
        if (!response.ok) {
            throw new Error('Failed to fetch projects')
        }
        const data = await response.json() as Partial<ProjectsResponsePayload>
        return {
            projects: Array.isArray(data.projects) ? data.projects : [],
            documents_path: typeof data.documents_path === 'string' ? data.documents_path : '/documents',
        }
    }, [])

    const {
        data: projectsData,
        isLoading,
        refetch: refetchProjects,
    } = usePersistedQuery<ProjectsResponsePayload>(PROJECTS_CACHE_KEY, fetchProjects, {
        version: 1,
        maxAgeMs: 10 * 60 * 1000,
    })

    const projects = projectsData?.projects ?? []
    const documentsPath = projectsData?.documents_path ?? '/documents'

    // Keep the selected project's stats up-to-date when the project list refreshes.
    useEffect(() => {
        if (!selectedProject) return
        const updated = projects.find((p) => p.path === selectedProject.path) || null
        if (!updated) return
        const isSame =
            updated.name === selectedProject.name &&
            updated.path === selectedProject.path &&
            updated.file_count === selectedProject.file_count &&
            updated.file_count_estimated === selectedProject.file_count_estimated &&
            updated.total_size_bytes === selectedProject.total_size_bytes &&
            updated.last_modified === selectedProject.last_modified &&
            updated.subdirectories === selectedProject.subdirectories
        if (isSame) return
        setSelectedProject(updated)
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    }, [projects, selectedProject])

    const selectProject = useCallback((project: Project) => {
        setSelectedProject(project)
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(project))
    }, [])

    const clearProject = useCallback(() => {
        setSelectedProject(null)
        sessionStorage.removeItem(STORAGE_KEY)
    }, [])

    return (
        <ProjectContext.Provider value={{
            selectedProject,
            selectProject,
            clearProject,
            projects,
            documentsPath,
            isLoading,
            refetchProjects,
        }}>
            {children}
        </ProjectContext.Provider>
    )
}

export function useProject() {
    const ctx = useContext(ProjectContext)
    if (!ctx) throw new Error('useProject must be used within a ProjectProvider')
    return ctx
}
