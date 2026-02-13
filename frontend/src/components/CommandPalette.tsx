import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Search, LayoutDashboard, FileText, Image, Calendar,
    Sparkles, Star, Scan, ArrowRight, Command
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaletteItem {
    id: string
    label: string
    section: 'navigation' | 'recent' | 'actions'
    icon: React.ReactNode
    action: () => void
    shortcut?: string
    description?: string
}

const RECENT_SEARCHES_KEY = 'archon_recent_searches'

function getRecentSearches(): string[] {
    try {
        return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]')
    } catch {
        return []
    }
}

export function addRecentSearch(query: string) {
    const recent = getRecentSearches()
    const updated = [query, ...recent.filter(s => s !== query)].slice(0, 10)
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
}

interface CommandPaletteProps {
    isOpen: boolean
    onClose: () => void
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('')
    const [activeIndex, setActiveIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const navigate = useNavigate()

    const navItems: PaletteItem[] = useMemo(() => [
        { id: 'nav-dashboard', label: 'Projets / Dashboard', description: 'Changer de projet ou voir l’état des scans', section: 'navigation', icon: <LayoutDashboard className="h-4 w-4" />, action: () => { navigate('/projects'); onClose() }, shortcut: 'N' },
        { id: 'nav-search', label: 'Recherche', description: 'Recherche par mot-clé ou sens (IA)', section: 'navigation', icon: <Search className="h-4 w-4" />, action: () => { navigate('/'); onClose() } },
        { id: 'nav-analysis', label: 'Analyse documents', description: 'Parcourir et filtrer tous les documents du projet', section: 'navigation', icon: <FileText className="h-4 w-4" />, action: () => { navigate('/analysis'); onClose() } },
        { id: 'nav-timeline', label: 'Timeline', description: 'Explorer les documents par date', section: 'navigation', icon: <Calendar className="h-4 w-4" />, action: () => { navigate('/timeline'); onClose() }, shortcut: 'T' },
        { id: 'nav-gallery', label: 'Galerie', description: 'Images et vidéos du projet', section: 'navigation', icon: <Image className="h-4 w-4" />, action: () => { navigate('/gallery'); onClose() }, shortcut: 'G' },
        { id: 'nav-chat', label: 'Chat IA', description: 'Poser des questions sur vos documents', section: 'navigation', icon: <Sparkles className="h-4 w-4" />, action: () => { navigate('/chat'); onClose() } },
        { id: 'nav-favorites', label: 'Favoris', description: 'Documents marqués et synthèse IA', section: 'navigation', icon: <Star className="h-4 w-4" />, action: () => { navigate('/favorites'); onClose() } },
        { id: 'nav-scans', label: 'Scans', description: 'Lancer ou suivre un scan', section: 'navigation', icon: <Scan className="h-4 w-4" />, action: () => { navigate('/scans'); onClose() } },
    ], [navigate, onClose])

    const recentItems: PaletteItem[] = useMemo(() => {
        return getRecentSearches().map((s, i) => ({
            id: `recent-${i}`,
            label: s,
            section: 'recent' as const,
            icon: <FileText className="h-4 w-4" />,
            action: () => {
                navigate(`/?q=${encodeURIComponent(s)}`)
                onClose()
            },
        }))
    }, [navigate, onClose])

    const allItems = useMemo(() => {
        const items = [...navItems, ...recentItems]
        if (!query) return items
        const lower = query.toLowerCase()
        return items.filter(item =>
            item.label.toLowerCase().includes(lower)
        )
    }, [navItems, recentItems, query])

    // Reset index when items change
    useEffect(() => {
        setActiveIndex(0)
    }, [allItems.length])

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('')
            setActiveIndex(0)
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [isOpen])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                setActiveIndex(i => Math.min(i + 1, allItems.length - 1))
                break
            case 'ArrowUp':
                e.preventDefault()
                setActiveIndex(i => Math.max(i - 1, 0))
                break
            case 'Enter':
                e.preventDefault()
                if (allItems[activeIndex]) {
                    allItems[activeIndex].action()
                }
                break
            case 'Escape':
                e.preventDefault()
                onClose()
                break
        }
    }, [allItems, activeIndex, onClose])

    if (!isOpen) return null

    const sections = [
        { key: 'navigation', label: 'Navigation' },
        { key: 'recent', label: 'Recherches récentes' },
    ]

    let globalIndex = 0

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Palette */}
            <div className="fixed inset-x-0 top-[15%] z-50 mx-auto w-full max-w-lg">
                <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(22,27,34,0.95)] shadow-2xl backdrop-blur-xl overflow-hidden">
                    {/* Search input */}
                    <div className="flex items-center gap-3 border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
                        <Command className="h-4 w-4 text-muted-foreground shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Rechercher une page, une action…"
                            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                            ESC
                        </kbd>
                    </div>

                    {/* Results */}
                    <div className="max-h-[60vh] overflow-y-auto py-2">
                        {allItems.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                                Aucun résultat pour « {query} »
                            </div>
                        ) : (
                            sections.map(section => {
                                const sectionItems = allItems.filter(i => i.section === section.key)
                                if (sectionItems.length === 0) return null

                                return (
                                    <div key={section.key}>
                                        <div className="px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                            {section.label}
                                        </div>
                                        {sectionItems.map(item => {
                                            const idx = globalIndex++
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={item.action}
                                                    onMouseEnter={() => setActiveIndex(idx)}
                                                    className={cn(
                                                        'flex items-center gap-3 w-full px-4 py-2.5 text-sm transition-colors text-left',
                                                        idx === activeIndex
                                                            ? 'bg-primary/10 text-foreground'
                                                            : 'text-muted-foreground hover:text-foreground'
                                                    )}
                                                >
                                                    {item.icon}
                                                    <span className="flex-1 min-w-0">
                                                        <span className="block truncate font-medium">{item.label}</span>
                                                        {item.description && (
                                                            <span className="block truncate text-[11px] text-muted-foreground mt-0.5">
                                                                {item.description}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {item.shortcut && (
                                                        <kbd className="hidden sm:inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground shrink-0">
                                                            {item.shortcut}
                                                        </kbd>
                                                    )}
                                                    <ArrowRight className={cn(
                                                        'h-3.5 w-3.5 shrink-0 transition-opacity',
                                                        idx === activeIndex ? 'opacity-100' : 'opacity-0'
                                                    )} />
                                                </button>
                                            )
                                        })}
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-[rgba(255,255,255,0.06)] px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <kbd className="rounded border bg-muted px-1">↑↓</kbd> naviguer
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="rounded border bg-muted px-1">↵</kbd> ouvrir
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="rounded border bg-muted px-1">esc</kbd> fermer
                        </span>
                    </div>
                </div>
            </div>
        </>
    )
}
