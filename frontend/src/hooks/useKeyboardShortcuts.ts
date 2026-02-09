import { useEffect } from 'react'

interface ShortcutConfig {
    key: string
    ctrlKey?: boolean
    shiftKey?: boolean
    altKey?: boolean
    handler: () => void
    /** If true, prevent default browser behavior */
    preventDefault?: boolean
    /** If true, shortcut only fires when no input is focused */
    ignoreInputFocus?: boolean
}

/**
 * Global keyboard shortcuts hook.
 * Registers shortcuts on mount and cleans up on unmount.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            for (const shortcut of shortcuts) {
                const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase()
                const ctrlMatch = !!shortcut.ctrlKey === (e.ctrlKey || e.metaKey)
                const shiftMatch = !!shortcut.shiftKey === e.shiftKey
                const altMatch = !!shortcut.altKey === e.altKey

                if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
                    // Skip if focused on an input/textarea/contenteditable
                    if (shortcut.ignoreInputFocus !== false) {
                        const tag = (e.target as HTMLElement)?.tagName
                        const isEditable = (e.target as HTMLElement)?.isContentEditable
                        if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) {
                            continue
                        }
                    }

                    if (shortcut.preventDefault !== false) {
                        e.preventDefault()
                    }
                    shortcut.handler()
                    break
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [shortcuts])
}
