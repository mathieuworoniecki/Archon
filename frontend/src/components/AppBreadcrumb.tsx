import { useLocation, Link } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { useProject } from '@/contexts/ProjectContext'
import { useTranslation } from '@/contexts/I18nContext'

const routeLabels: Record<string, string> = {
    '/': 'nav.search',
    '/analysis': 'nav.analysis',
    '/cockpit': 'nav.analysis',
    '/timeline': 'nav.timeline',
    '/chat': 'nav.chat',
    '/gallery': 'nav.gallery',
    '/favorites': 'nav.favorites',
    '/scans': 'nav.scans',
    '/entities': 'nav.entities',
    '/graph': 'nav.graph',
}

export function AppBreadcrumb() {
    const location = useLocation()
    const { selectedProject } = useProject()
    const { t } = useTranslation()

    // Don't show on projects page or login
    if (location.pathname === '/projects' || location.pathname === '/login') {
        return null
    }

    const labelKey = routeLabels[location.pathname]
    const pageLabel = labelKey ? t(labelKey) : location.pathname.slice(1)

    return (
        <nav className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-muted-foreground border-b border-[rgba(255,255,255,0.04)] bg-[rgba(22,27,34,0.3)]">
            <Link
                to="/projects"
                className="hover:text-foreground transition-colors flex items-center gap-1"
            >
                <Home className="h-3 w-3" />
                Projets
            </Link>

            {selectedProject && (
                <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                    <Link
                        to="/"
                        className="hover:text-foreground transition-colors"
                    >
                        {selectedProject.name}
                    </Link>
                </>
            )}

            {location.pathname !== '/' && (
                <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                    <span className="text-foreground/80 font-medium">
                        {pageLabel}
                    </span>
                </>
            )}
        </nav>
    )
}
