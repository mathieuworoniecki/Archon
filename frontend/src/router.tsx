import { createBrowserRouter, RouterProvider, Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { Shield, Github, Activity, FileText, Search, Star, Scan, LayoutDashboard, Sparkles, Calendar, Image as ImageIcon, Sun, Moon, Languages, LogOut, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStats } from '@/hooks/useStats'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useTheme } from '@/hooks/useTheme'
import { useTranslation } from '@/contexts/I18nContext'
import { useMemo, useState, useEffect, useCallback } from 'react'
import { isAuthenticated, clearAuth, getUser } from '@/lib/auth'
import { useProject, ProjectProvider } from '@/contexts/ProjectContext'
import { toast } from 'sonner'
import { CommandPalette } from '@/components/CommandPalette'
import { AppBreadcrumb } from '@/components/AppBreadcrumb'

// Import pages
import { HomePage } from '@/pages/HomePage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { ScansPage } from '@/pages/ScansPage'
import { CockpitPage } from '@/pages/CockpitPage'
import { ChatPage } from '@/pages/ChatPage'
import { TimelinePage } from '@/pages/TimelinePage'
import { GalleryPage } from '@/pages/GalleryPage'
import { LoginPage } from '@/pages/LoginPage'
import { ProjectDashboard } from '@/pages/ProjectDashboard'

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace />
    }
    return <>{children}</>
}

// Redirects to /projects if no project is currently selected
function ProjectGuard({ children }: { children: React.ReactNode }) {
    const { selectedProject } = useProject()
    if (!selectedProject) {
        return <Navigate to="/projects" replace />
    }
    return <>{children}</>
}

// Layout component with header and footer — shown only inside a project
function RootLayout() {
    const { stats, hasDocuments } = useStats()
    const location = useLocation()
    const navigate = useNavigate()
    const { theme, toggleTheme } = useTheme()
    const { t, locale, setLocale } = useTranslation()
    const { selectedProject, clearProject } = useProject()
    const [isPaletteOpen, setIsPaletteOpen] = useState(false)

    // Global keyboard shortcuts
    const shortcuts = useMemo(() => [
        {
            key: '/',
            handler: () => {
                navigate('/')
                setTimeout(() => {
                const searchInput = document.querySelector('input[type="search"], input[data-search]') as HTMLInputElement
                    searchInput?.focus()
                }, 100)
            },
        },
        {
            key: 'k',
            ctrlKey: true,
            handler: () => {
                setIsPaletteOpen(prev => !prev)
            },
            ignoreInputFocus: false,
        },
        {
            key: 'g',
            handler: () => navigate('/gallery'),
        },
        {
            key: 't',
            handler: () => navigate('/timeline'),
        },
        {
            key: '?',
            shiftKey: true,
            handler: () => {
                toast.info('Raccourcis clavier', {
                    description: 'Ctrl+K → Recherche · G → Galerie · T → Timeline · Esc → Fermer · ? → Aide',
                    duration: 5000,
                })
            },
        },
        {
            key: 'Escape',
            handler: () => {
                (document.activeElement as HTMLElement)?.blur()
            },
            ignoreInputFocus: false,
        },
    ], [navigate])

    useKeyboardShortcuts(shortcuts)

    const formatDocumentCount = (count: number): string => {
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}k`
        }
        return count.toString()
    }

    const navItems = [
        { path: '/', label: t('nav.search'), icon: Search },
        { path: '/cockpit', label: t('nav.analysis'), icon: LayoutDashboard },
        { path: '/timeline', label: t('nav.timeline'), icon: Calendar },
        { path: '/chat', label: t('nav.chat'), icon: Sparkles },
        { path: '/gallery', label: t('nav.gallery'), icon: ImageIcon },
        { path: '/favorites', label: t('nav.favorites'), icon: Star },
    ]

    return (
        <>
        <div className="h-screen flex flex-col bg-background">
            {/* Header */}
            <header className="border-b border-[rgba(255,255,255,0.06)] bg-gradient-to-r from-[rgba(30,41,59,0.4)] to-[rgba(15,23,42,0.5)] backdrop-blur-[16px] hud-scanlines">
                <div className="container mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="flex items-center gap-2.5">
                            {/* Back to projects button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5 h-8 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => { clearProject(); navigate('/projects') }}
                            >
                                <FolderOpen className="h-3.5 w-3.5" />
                                {t('nav.changeProject')}
                            </Button>
                            <div className="w-px h-5 bg-[rgba(255,255,255,0.08)]" />
                            <Link to="/" className="flex items-center gap-2.5">
                                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)]">
                                    <Shield className="h-5 w-5 text-[#F59E0B]" />
                                </div>
                                <span className="text-base font-bold tracking-tight hud-text-glow">
                                    {selectedProject?.name || 'Archon'}
                                </span>
                            </Link>
                        </div>

                        {/* Navigation */}
                        <nav className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(22,27,34,0.6)] p-0.5">
                            {navItems.map(({ path, label, icon: Icon }) => {
                                const isActive = location.pathname === path || 
                                    (path === '/' && location.pathname === '/')
                                return (
                                    <Link key={path} to={path}>
                                        <Button
                                            variant={isActive ? 'default' : 'ghost'}
                                            size="sm"
                                            className="gap-1.5 h-7 text-xs"
                                        >
                                            <Icon className="h-3 w-3" />
                                            {label}
                                        </Button>
                                    </Link>
                                )
                            })}
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Stats display */}
                        {hasDocuments && stats && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-data">
                                <FileText className="h-3.5 w-3.5" />
                                <span>{formatDocumentCount(stats.total_documents)} {t('header.docs')}</span>
                            </div>
                        )}

                        <Link to="/scans">
                            <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                                <Scan className="h-3 w-3" />
                                {t('nav.scans')}
                            </Button>
                        </Link>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={toggleTheme}
                            title={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
                        >
                            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1.5 text-xs gap-1"
                            onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
                            title={locale === 'fr' ? 'English' : 'Français'}
                        >
                            <Languages className="h-3.5 w-3.5" />
                            {locale.toUpperCase()}
                        </Button>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Activity className="h-3 w-3 text-green-500" />
                            <span>{getUser()?.username || t('header.connected')}</span>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                            onClick={() => { clearAuth(); navigate('/login') }}
                            title="Logout"
                        >
                            <LogOut className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Breadcrumb */}
            <AppBreadcrumb />

            {/* Main Content - Outlet renders the current route */}
            <main className="flex-1 overflow-hidden">
                <Outlet />
            </main>

            {/* Footer */}
            <footer className="border-t border-[rgba(255,255,255,0.06)] bg-[rgba(22,27,34,0.4)] backdrop-blur-[16px] py-2">
                <div className="container mx-auto px-4 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                        <span>{t('footer.version')}</span>
                        <HealthIndicator />
                    </div>
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
        <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />
        </>
    )
}

// Health indicator — polls /health every 30s
interface HealthStatus {
    status: string
    services: Record<string, boolean>
}

function HealthIndicator() {
    const [health, setHealth] = useState<HealthStatus | null>(null)

    const fetchHealth = useCallback(async () => {
        try {
            const resp = await fetch('/health')
            if (resp.ok) setHealth(await resp.json())
            else setHealth(null)
        } catch {
            setHealth(null)
        }
    }, [])

    useEffect(() => {
        fetchHealth()
        const interval = setInterval(fetchHealth, 30000)
        return () => clearInterval(interval)
    }, [fetchHealth])

    if (!health) return null

    const services = Object.entries(health.services || {})
    return (
        <div className="flex items-center gap-1.5">
            {services.map(([name, ok]) => (
                <div
                    key={name}
                    className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
                    title={`${name}: ${ok ? 'healthy' : 'down'}`}
                />
            ))}
            {health.status === 'degraded' && (
                <span className="text-red-400 text-[10px] font-medium ml-0.5">degraded</span>
            )}
        </div>
    )
}

// Router configuration
export const router = createBrowserRouter([
    {
        path: '/login',
        element: <LoginPage />,
    },
    {
        path: '/projects',
        element: <ProtectedRoute><ProjectDashboard /></ProtectedRoute>,
    },
    {
        path: '/',
        element: <ProtectedRoute><ProjectGuard><RootLayout /></ProjectGuard></ProtectedRoute>,
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
    return (
        <ProjectProvider>
            <RouterProvider router={router} />
        </ProjectProvider>
    )
}
