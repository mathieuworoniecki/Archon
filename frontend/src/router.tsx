import { createBrowserRouter, RouterProvider, Outlet, Link, useLocation, useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { Shield, Github, Activity, FileText, Search, Star, Scan, Sparkles, Calendar, Image as ImageIcon, Sun, Moon, LogOut, FolderOpen, Users, Network, ScrollText, BellRing, CheckSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useStats } from '@/hooks/useStats'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useTheme } from '@/hooks/useTheme'
import { useTranslation } from '@/contexts/I18nContext'
import { useMemo, useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { isAuthenticated, clearAuth, getUser } from '@/lib/auth'
import { useProject, ProjectProvider } from '@/contexts/ProjectContext'
import { toast } from 'sonner'
import { CommandPalette } from '@/components/CommandPalette'
import { AppBreadcrumb } from '@/components/AppBreadcrumb'
import { checkHealth, type HealthStatus } from '@/lib/api'

const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage })))
const ScansPage = lazy(() => import('@/pages/ScansPage').then((m) => ({ default: m.ScansPage })))
const ChatPage = lazy(() => import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage })))
const TimelinePage = lazy(() => import('@/pages/TimelinePage').then((m) => ({ default: m.TimelinePage })))
const GalleryPage = lazy(() => import('@/pages/GalleryPage').then((m) => ({ default: m.GalleryPage })))
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const ProjectDashboard = lazy(() => import('@/pages/ProjectDashboard').then((m) => ({ default: m.ProjectDashboard })))
const EntitiesPage = lazy(() => import('@/pages/EntitiesPage').then((m) => ({ default: m.EntitiesPage })))
const GraphPage = lazy(() => import('@/pages/GraphPage').then((m) => ({ default: m.GraphPage })))
const CockpitPage = lazy(() => import('@/pages/CockpitPage').then((m) => ({ default: m.CockpitPage })))
const AuditPage = lazy(() => import('@/pages/AuditPage').then((m) => ({ default: m.AuditPage })))
const WatchlistPage = lazy(() => import('@/pages/WatchlistPage').then((m) => ({ default: m.WatchlistPage })))
const TasksPage = lazy(() => import('@/pages/TasksPage').then((m) => ({ default: m.TasksPage })))

function RouteLoadingFallback() {
    return (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Loading...
        </div>
    )
}

function withRouteSuspense(element: JSX.Element): JSX.Element {
    return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    if (!isAuthenticated()) {
        return <Navigate to="/login" replace />
    }
    return <>{children}</>
}

// Redirect /analysis?q=... → /?q=...  or /analysis?date=... → /?date=...
function AnalysisRedirect() {
    const [searchParams] = useSearchParams()
    const target = new URLSearchParams()
    const q = searchParams.get('q')
    const date = searchParams.get('date')
    const doc = searchParams.get('doc')
    if (q) target.set('q', q)
    if (date) target.set('date', date)
    if (doc) target.set('doc', doc)
    const qs = target.toString()
    return <Navigate to={qs ? `/?${qs}` : '/'} replace />
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
    const { selectedProject } = useProject()
    const [isPaletteOpen, setIsPaletteOpen] = useState(false)
    const mainContentRef = useRef<HTMLElement>(null)
    const lastFocusedLocationKeyRef = useRef(location.key)
    const shortcutsHelpDescription = useMemo(() => {
        const baseDescription = t('shortcuts.description')
        const additions = [
            `N → ${t('nav.scans')}`,
            `R → ${t('nav.scans')}`,
            `F → ${t('nav.favorites')}`,
            `←/→ → ${t('viewer.prevDocument')} / ${t('viewer.nextDocument')}`,
        ]
        const missingAdditions = additions.filter(addition => !baseDescription.includes(addition))
        return missingAdditions.length > 0 ? `${baseDescription} · ${missingAdditions.join(' · ')}` : baseDescription
    }, [t])

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
            key: 'n',
            handler: () => navigate('/scans'),
        },
        {
            key: 'r',
            handler: () => navigate('/scans'),
        },
        {
            key: 'f',
            handler: () => navigate('/favorites'),
        },
        {
            key: '?',
            shiftKey: true,
            handler: () => {
                toast.info(t('shortcuts.title'), {
                    description: shortcutsHelpDescription,
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
    ], [navigate, shortcutsHelpDescription, t])

    useKeyboardShortcuts(shortcuts)

    useEffect(() => {
        if (location.key === lastFocusedLocationKeyRef.current) {
            return
        }

        lastFocusedLocationKeyRef.current = location.key

        if (isPaletteOpen) {
            return
        }

        const frameId = window.requestAnimationFrame(() => {
            mainContentRef.current?.focus({ preventScroll: true })
        })

        return () => window.cancelAnimationFrame(frameId)
    }, [isPaletteOpen, location.key])

    const formatDocumentCount = (count: number): string => {
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}k`
        }
        return count.toString()
    }

    const navGroups = [
        // Discovery
        [
            { path: '/', label: t('nav.search'), icon: Search },
            { path: '/cockpit', label: t('nav.analysis'), icon: FileText },
            { path: '/timeline', label: t('nav.timeline'), icon: Calendar },
        ],
        // Intelligence
        [
            { path: '/chat', label: t('nav.chat'), icon: Sparkles },
            { path: '/entities', label: t('nav.entities'), icon: Users },
            { path: '/graph', label: t('nav.graph'), icon: Network },
            { path: '/audit', label: t('nav.audit'), icon: ScrollText },
        ],
        // Collections
        [
            { path: '/gallery', label: t('nav.gallery'), icon: ImageIcon },
            { path: '/favorites', label: t('nav.favorites'), icon: Star },
            { path: '/watchlist', label: t('nav.watchlist'), icon: BellRing },
            { path: '/tasks', label: t('nav.tasks'), icon: CheckSquare },
        ],
    ]

    return (
        <>
        <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
        >
            Skip to main content
        </a>
        <div className="h-screen flex flex-col bg-background">
            {/* Header */}
            <header className="border-b border-[rgba(255,255,255,0.06)] bg-gradient-to-r from-[rgba(30,41,59,0.4)] to-[rgba(15,23,42,0.5)] backdrop-blur-[16px] hud-scanlines">
                <div className="container mx-auto px-4 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-5">
                        <div className="flex items-center gap-2.5">
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
                        <nav aria-label="Primary navigation" className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(22,27,34,0.6)] p-0.5">
                            {navGroups.map((group, groupIdx) => (
                                <div key={groupIdx} className="flex items-center">
                                    {groupIdx > 0 && (
                                        <div className="w-px h-5 bg-[rgba(255,255,255,0.12)] mx-0.5" />
                                    )}
                                    {group.map(({ path, label, icon: Icon }) => {
                                        const isActive = location.pathname === path || 
                                            (path === '/' && location.pathname === '/')
                                        return (
                                            <Link key={path} to={path} aria-current={isActive ? 'page' : undefined}>
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
                                </div>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Stats display */}
                        {hasDocuments && stats && (
                            <div className="hidden xl:flex items-center gap-1.5 h-7 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(22,27,34,0.45)] px-2 text-xs text-muted-foreground font-data">
                                <FileText className="h-3.5 w-3.5" />
                                <span>{formatDocumentCount(stats.total_documents)} {t('header.docs')}</span>
                            </div>
                        )}

                        <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(22,27,34,0.55)] p-0.5">
                            <Link to="/projects">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    title={t('nav.changeProject')}
                                >
                                    <FolderOpen className="h-3.5 w-3.5" />
                                </Button>
                            </Link>
                            <div className="w-px h-4 bg-[rgba(255,255,255,0.12)] mx-0.5" />
                            <Link to="/scans">
                                <Button variant="ghost" size="sm" className="gap-1 h-7 px-2 text-xs text-muted-foreground hover:text-foreground">
                                    <Scan className="h-3 w-3" />
                                    <span className="hidden sm:inline">{t('nav.scans')}</span>
                                </Button>
                            </Link>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={toggleTheme}
                                title={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
                            >
                                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px] font-semibold tracking-wide text-muted-foreground hover:text-foreground"
                                onClick={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
                                title={locale === 'fr' ? 'English' : 'Français'}
                            >
                                {locale.toUpperCase()}
                            </Button>
                        </div>

                        <div className="hidden md:flex items-center gap-1.5 h-7 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(22,27,34,0.45)] px-2 text-xs text-muted-foreground">
                            <Activity className="h-3 w-3 text-green-500" />
                            <span className="max-w-[140px] truncate">{getUser()?.username || t('header.connected')}</span>
                        </div>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                            onClick={() => { clearAuth(); navigate('/login') }}
                            title={t('header.logout')}
                        >
                            <LogOut className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Breadcrumb */}
            <AppBreadcrumb />

            {/* Main Content - Outlet renders the current route */}
            <main
                id="main-content"
                ref={mainContentRef}
                tabIndex={-1}
                aria-label="Main content"
                className="flex-1 overflow-hidden focus:outline-none"
            >
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

const HEALTHY_SERVICE_STATUSES = new Set(['ok', 'healthy', 'up', 'running'])

function isServiceHealthy(status: unknown): boolean {
    if (typeof status === 'boolean') return status
    if (typeof status !== 'string') return false
    return HEALTHY_SERVICE_STATUSES.has(status.trim().toLowerCase())
}

function HealthIndicator() {
    const [health, setHealth] = useState<HealthStatus | null>(null)
    const { t } = useTranslation()

    const fetchHealth = useCallback(async () => {
        try {
            setHealth(await checkHealth())
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
    const serviceStates = services.map(([name, status]) => ({
        name,
        isHealthy: isServiceHealthy(status),
    }))
    const isOverallDegraded =
        health.status.trim().toLowerCase() !== 'healthy' ||
        serviceStates.some(({ isHealthy }) => !isHealthy)
    const statusColor = isOverallDegraded ? 'bg-red-500 animate-pulse' : 'bg-green-500'

    return (
        <div className="relative group">
            <div className="flex items-center gap-1.5 cursor-pointer">
                <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                {isOverallDegraded && (
                    <span className="text-red-400 text-[10px] font-medium">{t('health.degraded')}</span>
                )}
            </div>

            {/* Hover popover */}
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50">
                <div className="bg-popover border rounded-lg shadow-lg p-3 min-w-[180px] text-xs">
                    <p className="font-medium mb-2">{t('health.services')}</p>
                    <div className="space-y-1.5">
                        {serviceStates.map(({ name, isHealthy }) => (
                            <div key={name} className="flex items-center justify-between gap-3">
                                <span className="capitalize">{name}</span>
                                <span className={isHealthy ? 'text-green-500' : 'text-red-500'}>
                                    {isHealthy ? '✓ ' + t('health.healthy') : '✗ ' + t('health.down')}
                                </span>
                            </div>
                        ))}
                    </div>
                    {isOverallDegraded && (
                        <button
                            onClick={fetchHealth}
                            className="mt-2 w-full text-center text-[10px] text-muted-foreground hover:text-foreground transition-colors py-1 border-t border-border"
                        >
                            {t('health.retryHealth')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

// Router configuration
export const router = createBrowserRouter([
    {
        path: '/login',
        element: withRouteSuspense(<LoginPage />),
    },
    {
        path: '/projects',
        element: withRouteSuspense(<ProtectedRoute><ProjectDashboard /></ProtectedRoute>),
    },
    {
        path: '/',
        element: withRouteSuspense(<ProtectedRoute><ProjectGuard><RootLayout /></ProjectGuard></ProtectedRoute>),
        children: [
            {
                index: true,
                element: withRouteSuspense(<HomePage />),
            },
            {
                path: 'favorites',
                element: withRouteSuspense(<FavoritesPage />),
            },
            {
                path: 'analysis',
                element: <AnalysisRedirect />,
            },
            {
                path: 'cockpit',
                element: withRouteSuspense(<CockpitPage />),
            },
            {
                path: 'scans',
                element: withRouteSuspense(<ScansPage />),
            },
            {
                path: 'chat',
                element: withRouteSuspense(<ChatPage />),
            },
            {
                path: 'timeline',
                element: withRouteSuspense(<TimelinePage />),
            },
            {
                path: 'gallery',
                element: withRouteSuspense(<GalleryPage />),
            },
            {
                path: 'entities',
                element: withRouteSuspense(<EntitiesPage />),
            },
            {
                path: 'graph',
                element: withRouteSuspense(<GraphPage />),
            },
            {
                path: 'audit',
                element: withRouteSuspense(<AuditPage />),
            },
            {
                path: 'watchlist',
                element: withRouteSuspense(<WatchlistPage />),
            },
            {
                path: 'tasks',
                element: withRouteSuspense(<TasksPage />),
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
