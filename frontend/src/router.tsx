import { createBrowserRouter, RouterProvider, Outlet, Link, useLocation } from 'react-router-dom'
import { Shield, Github, Activity, FileText, Search, Star, Scan, LayoutDashboard, Sparkles, Calendar, Image as ImageIcon, FolderSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStats } from '@/hooks/useStats'

// Import pages
import { HomePage } from '@/pages/HomePage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { ScansPage } from '@/pages/ScansPage'
import { CockpitPage } from '@/pages/CockpitPage'
import { ChatPage } from '@/pages/ChatPage'
import { TimelinePage } from '@/pages/TimelinePage'
import { GalleryPage } from '@/pages/GalleryPage'

// Layout component with header and footer
function RootLayout() {
    const { stats, hasDocuments } = useStats()
    const location = useLocation()

    const formatDocumentCount = (count: number): string => {
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}k`
        }
        return count.toString()
    }

    const navItems = [
        { path: '/', label: 'Recherche', icon: Search },
        { path: '/cockpit', label: 'Cockpit', icon: LayoutDashboard },
        { path: '/timeline', label: 'Timeline', icon: Calendar },
        { path: '/chat', label: 'IA', icon: Sparkles },
        { path: '/gallery', label: 'Galerie', icon: ImageIcon },
        { path: '/favorites', label: 'Favoris', icon: Star },
        { path: '/scans', label: 'Scans', icon: Scan },
    ]

    return (
        <div className="h-screen flex flex-col bg-background">
            {/* Header */}
            <header className="border-b bg-card/50 backdrop-blur-sm">
                <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <Link to="/" className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                                <Shield className="h-6 w-6 text-primary" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold tracking-tight">Archon</h1>
                                <p className="text-xs text-muted-foreground">Investigation numérique</p>
                            </div>
                        </Link>

                        {/* Navigation */}
                        <nav className="flex items-center rounded-lg border bg-card p-1">
                            {navItems.map(({ path, label, icon: Icon }) => {
                                const isActive = location.pathname === path || 
                                    (path === '/' && location.pathname === '/')
                                return (
                                    <Link key={path} to={path}>
                                        <Button
                                            variant={isActive ? 'default' : 'ghost'}
                                            size="sm"
                                            className="gap-1.5 h-7"
                                        >
                                            <Icon className="h-3.5 w-3.5" />
                                            {label}
                                        </Button>
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Stats display */}
                        {hasDocuments && stats && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <FileText className="h-4 w-4" />
                                <span>{formatDocumentCount(stats.total_documents)} documents</span>
                            </div>
                        )}

                        <Link to="/scans">
                            <Button variant="outline" size="sm" className="gap-2">
                                <FolderSearch className="h-4 w-4" />
                                Scanner
                            </Button>
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Activity className="h-3 w-3 text-green-500" />
                            <span>Connecté</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content - Outlet renders the current route */}
            <main className="flex-1 overflow-hidden">
                <Outlet />
            </main>

            {/* Footer */}
            <footer className="border-t bg-card/30 py-2">
                <div className="container mx-auto px-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Archon v1.0 — Recherche Hybride (Meilisearch + Qdrant)</span>
                    <a
                        href="https://github.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                        <Github className="h-3 w-3" />
                        GitHub
                    </a>
                </div>
            </footer>
        </div>
    )
}

// Router configuration
export const router = createBrowserRouter([
    {
        path: '/',
        element: <RootLayout />,
        children: [
            {
                index: true,
                element: <HomePage />,
            },
            {
                path: 'favorites',
                element: <FavoritesPage />,
            },
            {
                path: 'cockpit',
                element: <CockpitPage />,
            },
            {
                path: 'scans',
                element: <ScansPage />,
            },
            {
                path: 'chat',
                element: <ChatPage />,
            },
            {
                path: 'timeline',
                element: <TimelinePage />,
            },
            {
                path: 'gallery',
                element: <GalleryPage />,
            },
        ],
    },
])

export function AppRouter() {
    return <RouterProvider router={router} />
}
