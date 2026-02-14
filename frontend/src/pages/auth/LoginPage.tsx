import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Loader2, Eye, EyeOff, Network } from 'lucide-react'
import { setTokens, setUser } from '@/lib/auth'
import { useTranslation } from '@/contexts/I18nContext'
import loginBg from '@/assets/login-bg.png'

export function LoginPage() {
    const navigate = useNavigate()
    const { t } = useTranslation()
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
                setError(data.message || data.detail || t('login.errorAuth'))
                setLoading(false)
                return
            }

            if (isRegister) {
                const loginRes = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                })
                const loginData = await loginRes.json().catch(() => ({}))
                if (!loginRes.ok) {
                    setError(loginData.message || loginData.detail || t('login.errorAuth'))
                    return
                }
                setTokens(loginData.access_token, loginData.refresh_token)
                setUser({ username: loginData.username, role: loginData.role })
            } else {
                setTokens(data.access_token, data.refresh_token)
                setUser({ username: data.username, role: data.role })
            }

            navigate('/')
        } catch {
            setError(t('login.errorNetwork'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex">
            {/* ═══ Left Panel — Illustration ═══ */}
            <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden">
                {/* Background image */}
                <img
                    src={loginBg}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                />
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-[rgba(2,6,23,0.7)] via-[rgba(15,23,42,0.5)] to-[rgba(2,6,23,0.8)]" />

                {/* Content overlay */}
                <div className="relative z-10 flex flex-col justify-between p-12 w-full">
                    {/* Logo + Brand */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.25)]">
                            <Shield className="h-5 w-5 text-[#F59E0B]" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-white/90">Archon</span>
                    </div>

                    {/* Tagline */}
                    <div className="max-w-md space-y-4">
                        <h2 className="text-3xl font-bold text-white leading-tight">
                            {t('login.heroTitle')}
                        </h2>
                        <p className="text-base text-white/60 leading-relaxed">
                            {t('login.heroSubtitle')}
                        </p>
                        <div className="flex items-center gap-6 pt-2">
                            <div className="flex items-center gap-2 text-sm text-white/50">
                                <Network className="h-4 w-4 text-amber-500/70" />
                                <span>{t('login.featureGraph')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-white/50">
                                <Shield className="h-4 w-4 text-amber-500/70" />
                                <span>{t('login.featureSecure')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer attribution */}
                    <p className="text-xs text-white/30">
                        {t('footer.version')}
                    </p>
                </div>
            </div>

            {/* ═══ Right Panel — Login Form ═══ */}
            <div className="flex-1 flex items-center justify-center px-6 py-12 bg-background">
                <div className="w-full max-w-sm space-y-8">
                    {/* Mobile-only logo */}
                    <div className="lg:hidden text-center">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] mb-3">
                            <Shield className="h-7 w-7 text-[#F59E0B]" />
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">Archon</h1>
                    </div>

                    {/* Header */}
                    <div className="space-y-1.5">
                        <h2 className="text-2xl font-bold tracking-tight">
                            {isRegister ? t('login.createYourAccount') : t('login.welcomeBack')}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {t('header.subtitle')}
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5" aria-describedby={error ? 'login-error' : undefined}>
                        <div className="space-y-1.5">
                            <label htmlFor="username" className="block text-sm font-medium">
                                {t('login.username')}
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-3.5 py-2.5 bg-muted/50 border border-border rounded-lg text-sm
                                           focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/30
                                           transition-all placeholder:text-muted-foreground/50"
                                placeholder={t('login.placeholderUsername')}
                                required
                                minLength={3}
                                autoFocus
                                autoComplete="username"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="password" className="block text-sm font-medium">
                                {t('login.password')}
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3.5 py-2.5 pr-10 bg-muted/50 border border-border rounded-lg text-sm
                                               focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/30
                                               transition-all placeholder:text-muted-foreground/50"
                                    placeholder={t('login.placeholderPassword')}
                                    required
                                    minLength={isRegister ? 6 : 4}
                                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div id="login-error" role="alert" aria-live="polite"
                                className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3.5 py-2.5 flex items-start gap-2">
                                <span className="shrink-0 mt-0.5">⚠</span>
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !username || !password}
                            className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium
                                       hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                                       transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {isRegister ? t('login.creating') : t('login.signingIn')}
                                </>
                            ) : (
                                isRegister ? t('login.createAccount') : t('login.signIn')
                            )}
                        </button>
                    </form>

                    {/* Toggle register/login */}
                    <div className="text-center space-y-3">
                        <button
                            type="button"
                            onClick={() => { setIsRegister(!isRegister); setError('') }}
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                        >
                            {isRegister
                                ? t('login.switchToSignIn')
                                : t('login.switchToRegister')}
                        </button>
                        <p className="text-xs text-muted-foreground/60">
                            {t('login.firstUserAdmin')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
