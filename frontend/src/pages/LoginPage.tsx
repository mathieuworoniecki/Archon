import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Loader2, Eye, EyeOff } from 'lucide-react'
import { setTokens, setUser } from '@/lib/auth'

export function LoginPage() {
    const navigate = useNavigate()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [isRegister, setIsRegister] = useState(false)

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.detail || 'Authentication failed')
                setLoading(false)
                return
            }

            if (isRegister) {
                // After registration, auto-login
                const loginRes = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                })
                const loginData = await loginRes.json()
                if (loginRes.ok) {
                    setTokens(loginData.access_token, loginData.refresh_token)
                    setUser({ username: loginData.username, role: loginData.role })
                }
            } else {
                setTokens(data.access_token, data.refresh_token)
                setUser({ username: data.username, role: data.role })
            }

            navigate('/')
        } catch {
            setError('Network error. Is the server running?')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center retro-grid">
            <div className="w-full max-w-sm mx-auto">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] mb-4 hud-glow">
                        <Shield className="h-8 w-8 text-[#F59E0B]" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight hud-text-glow">Archon</h1>
                    <p className="text-sm text-muted-foreground mt-1 font-data">
                        Digital Investigation Platform
                    </p>
                </div>

                {/* Form */}
                <div className="rui-glass-panel hud-bracket p-6">
                    <h2 className="text-lg font-semibold mb-4">
                        {isRegister ? 'Create Account' : 'Sign In'}
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium mb-1.5">
                                Username
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-3 py-2 bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.08)] rounded-lg text-sm
                                           focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-[rgba(245,158,11,0.3)]
                                           transition-colors"
                                placeholder="Enter your username"
                                required
                                minLength={3}
                                autoFocus
                                autoComplete="username"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2 pr-10 bg-[rgba(22,27,34,0.6)] border border-[rgba(255,255,255,0.08)] rounded-lg text-sm
                                               focus:outline-none focus:ring-2 focus:ring-[#F59E0B] focus:border-[rgba(245,158,11,0.3)]
                                               transition-colors"
                                    placeholder="Enter your password"
                                    required
                                    minLength={isRegister ? 6 : 4}
                                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !username || !password}
                            className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium
                                       hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                                       transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {isRegister ? 'Creating...' : 'Signing in...'}
                                </>
                            ) : (
                                isRegister ? 'Create Account' : 'Sign In'
                            )}
                        </button>
                    </form>

                    <div className="mt-4 text-center">
                        <button
                            type="button"
                            onClick={() => { setIsRegister(!isRegister); setError('') }}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            {isRegister
                                ? 'Already have an account? Sign in'
                                : "First time? Create an account"}
                        </button>
                    </div>
                </div>

                <p className="text-xs text-muted-foreground text-center mt-4">
                    First user registered becomes admin
                </p>
            </div>
        </div>
    )
}
