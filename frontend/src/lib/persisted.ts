export interface PersistedEnvelope<T> {
    v: number
    ts: number
    data: T
}

interface LoadOptions {
    version?: number
    maxAgeMs?: number
}

export function loadPersisted<T>(key: string, options?: LoadOptions): T | null {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw) as PersistedEnvelope<T>
        if (!parsed || typeof parsed !== 'object') return null
        if (typeof parsed.v !== 'number' || typeof parsed.ts !== 'number') return null
        if (options?.version !== undefined && parsed.v !== options.version) return null
        if (options?.maxAgeMs !== undefined) {
            const age = Date.now() - parsed.ts
            if (age > options.maxAgeMs) return null
        }
        return parsed.data ?? null
    } catch {
        return null
    }
}

export function savePersisted<T>(key: string, data: T, version = 1): void {
    try {
        const envelope: PersistedEnvelope<T> = {
            v: version,
            ts: Date.now(),
            data,
        }
        localStorage.setItem(key, JSON.stringify(envelope))
    } catch {
        // ignore storage failures (quota, disabled, etc.)
    }
}

export function clearPersisted(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch {
        // ignore
    }
}

