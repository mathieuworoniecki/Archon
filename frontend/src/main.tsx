import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppRouter } from './router.tsx'
import { ThemeProvider } from './hooks/useTheme.tsx'
import { I18nProvider } from './contexts/I18nContext.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { checkAuthConfig } from './lib/auth.ts'
import { Toaster } from 'sonner'
import './index.css'

// Check auth config before rendering (async, non-blocking for cache)
checkAuthConfig().finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <ErrorBoundary>
                <I18nProvider>
                    <ThemeProvider>
                        <AppRouter />
                        <Toaster
                            position="bottom-right"
                            toastOptions={{
                                style: {
                                    background: 'hsl(222 47% 11%)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: 'hsl(210 40% 98%)',
                                    fontSize: '13px',
                                },
                            }}
                            theme="dark"
                            richColors
                        />
                    </ThemeProvider>
                </I18nProvider>
            </ErrorBoundary>
        </React.StrictMode>,
    )
})
