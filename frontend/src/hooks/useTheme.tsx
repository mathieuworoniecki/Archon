import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
    theme: Theme
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        const stored = localStorage.getItem('archon-theme')
        return (stored === 'light' || stored === 'dark') ? stored : 'dark'
    })
    const hasMountedRef = useRef(false)

    useEffect(() => {
        const root = document.documentElement

        // Smooth theme transitions (avoid on first paint).
        if (hasMountedRef.current) {
            root.classList.add('theme-transition')
            window.setTimeout(() => root.classList.remove('theme-transition'), 260)
        } else {
            hasMountedRef.current = true
        }

        if (theme === 'light') {
            root.classList.add('light')
        } else {
            root.classList.remove('light')
        }
        localStorage.setItem('archon-theme', theme)
    }, [theme])

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark')
    }

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
