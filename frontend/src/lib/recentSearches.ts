const RECENT_SEARCHES_KEY = 'archon_recent_searches'

export function loadRecentSearches(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
        const parsed: unknown = raw ? JSON.parse(raw) : []
        if (!Array.isArray(parsed)) return []
        return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    } catch {
        return []
    }
}

/** Adds a query to the recent searches list (deduped) and returns the updated list. */
export function addRecentSearch(query: string): string[] {
    const normalized = query.trim()
    if (!normalized) return loadRecentSearches()
    try {
        const current = loadRecentSearches()
        const updated = [normalized, ...current.filter((entry) => entry !== normalized)].slice(0, 10)
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
        return updated
    } catch {
        return loadRecentSearches()
    }
}

export function clearRecentSearches(): void {
    try {
        localStorage.removeItem(RECENT_SEARCHES_KEY)
    } catch {
        // ignore
    }
}

