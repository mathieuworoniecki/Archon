/**
 * ProjectContext — Global project selection state.
 * Persists selected project in sessionStorage so navigation within
 * the app keeps the project context alive.
 */
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { API_BASE } from '@/lib/api'
import { authFetch } from '@/lib/auth'

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

export function ProjectProvider({ children }: { children: ReactNode }) {
    const [selectedProject, setSelectedProject] = useState<Project | null>(() => {
        try {
            const stored = sessionStorage.getItem(STORAGE_KEY)
            return stored ? JSON.parse(stored) : null
        } catch {
            return null
        }
    })
    const [projects, setProjects] = useState<Project[]>([])
    const [documentsPath, setDocumentsPath] = useState('/documents')
    const [isLoading, setIsLoading] = useState(true)

    const fetchProjects = useCallback(async () => {
        setIsLoading(true)
        try {
            const response = await authFetch(`${API_BASE}/projects/`)
            if (response.ok) {
                const data = await response.json()
                setProjects(data.projects || [])
                setDocumentsPath(data.documents_path || '/documents')
            }
        } catch {
            // fetch failure results in empty project list — UI handles this gracefully
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => { fetchProjects() }, [fetchProjects])

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
            refetchProjects: fetchProjects,
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
