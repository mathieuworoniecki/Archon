/**
 * Archon - Authentication Helper
 * Manages JWT tokens in localStorage and provides auth state.
 */

const TOKEN_KEY = 'archon_access_token'
const REFRESH_KEY = 'archon_refresh_token'
const USER_KEY = 'archon_user'
const AUTH_DISABLED_KEY = 'archon_auth_disabled'

export interface AuthUser {
    username: string
    role: string
}

// ── Token Management ────────────────────────────────────

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function setUser(user: AuthUser): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getUser(): AuthUser | null {
    const data = localStorage.getItem(USER_KEY)
    if (!data) return null
    try { return JSON.parse(data) } catch { return null }
}

export function clearAuth(): void {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
}

export function isAuthDisabled(): boolean {
    return sessionStorage.getItem(AUTH_DISABLED_KEY) === 'true'
}

export async function checkAuthConfig(): Promise<void> {
    try {
        const res = await fetch('/api/auth/config')
        if (res.ok) {
            const data = await res.json()
            if (data.auth_disabled) {
                sessionStorage.setItem(AUTH_DISABLED_KEY, 'true')
            }
        }
    } catch { /* ignore */ }
}

export function isAuthenticated(): boolean {
    if (isAuthDisabled()) return true
    
    const token = getToken()
    if (!token) return false
    
    // Check if token is expired (JWT payload is base64)
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return payload.exp * 1000 > Date.now()
    } catch {
        return false
    }
}

// ── Auth Headers ────────────────────────────────────────

export function getAuthHeaders(): Record<string, string> {
    const token = getToken()
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
}

export function withAuthTokenQuery(url: string): string {
    const token = getToken()
    if (!token) return url
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}access_token=${encodeURIComponent(token)}`
}

// ── Auth Fetch (wrapper) ────────────────────────────────

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers)
    const token = getToken()
    
    if (token) {
        headers.set('Authorization', `Bearer ${token}`)
    }
    
    let response = await fetch(url, { ...options, headers })
    
    // If 401, try to refresh the token
    if (response.status === 401 && getRefreshToken()) {
        const refreshed = await tryRefreshToken()
        if (refreshed) {
            // Retry with new token
            headers.set('Authorization', `Bearer ${getToken()}`)
            response = await fetch(url, { ...options, headers })
        } else {
            // Refresh failed — redirect to login
            clearAuth()
            window.location.href = '/login'
        }
    }
    
    return response
}

async function tryRefreshToken(): Promise<boolean> {
    try {
        const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: getRefreshToken() }),
        })
        
        if (!res.ok) return false
        
        const data = await res.json()
        setTokens(data.access_token, data.refresh_token)
        return true
    } catch {
        return false
    }
}
