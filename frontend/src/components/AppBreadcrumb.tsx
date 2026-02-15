import { useLocation, Link } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { useProject } from '@/contexts/ProjectContext'
import { useTranslation } from '@/contexts/I18nContext'

const routeLabels: Record<string, string> = {
    '/': 'nav.documents',
    // Legacy aliases: keep breadcrumbs consistent with the single Documents workspace.
    '/analysis': 'nav.search',
    '/cockpit': 'nav.search',
    '/timeline': 'nav.timeline',
    '/chat': 'nav.chat',
    '/gallery': 'nav.search',
    '/favorites': 'nav.favorites',
    '/scans': 'nav.scans',
    '/entities': 'nav.entities',
    '/graph': 'nav.graph',
    '/audit': 'nav.audit',
    '/watchlist': 'nav.watchlist',
    '/tasks': 'nav.tasks',
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
        <nav className="border-b border-[rgba(255,255,255,0.04)] bg-[rgba(22,27,34,0.3)]">
            <div className="container mx-auto px-4 py-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
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
            </div>
        </nav>
    )
}
