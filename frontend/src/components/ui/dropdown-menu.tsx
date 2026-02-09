import * as React from 'react'
import { cn } from '@/lib/utils'

// Simple dropdown menu implementation using native details/summary
interface DropdownMenuProps {
    children: React.ReactNode
}

export function DropdownMenu({ children }: DropdownMenuProps) {
    const [open, setOpen] = React.useState(false)
    const ref = React.useRef<HTMLDivElement>(null)

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div ref={ref} className="relative inline-block">
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    if (child.type === DropdownMenuTrigger) {
                        return React.cloneElement(child as React.ReactElement<any>, {
                            onClick: () => setOpen(!open)
                        })
                    }
                    if (child.type === DropdownMenuContent) {
                        return open ? React.cloneElement(child as React.ReactElement<any>, {
                            onClose: () => setOpen(false)
                        }) : null
                    }
                }
                return child
            })}
        </div>
    )
}

interface DropdownMenuTriggerProps {
    children: React.ReactNode
    asChild?: boolean
    onClick?: () => void
}

export function DropdownMenuTrigger({ children, asChild, onClick }: DropdownMenuTriggerProps) {
    if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children as React.ReactElement<any>, { onClick })
    }
    return <button onClick={onClick}>{children}</button>
}

interface DropdownMenuContentProps {
    children: React.ReactNode
    align?: 'start' | 'center' | 'end'
    onClose?: () => void
}

export function DropdownMenuContent({ children, align = 'start', onClose }: DropdownMenuContentProps) {
    const alignClass = {
        start: 'left-0',
        center: 'left-1/2 -translate-x-1/2',
        end: 'right-0'
    }

    return (
        <div className={cn(
            "absolute top-full mt-1 z-50 min-w-32 rounded-md p-1 shadow-glass",
            "bg-gradient-to-b from-[rgba(30,41,59,0.5)] to-[rgba(15,23,42,0.7)]",
            "backdrop-blur-[16px] backdrop-saturate-[90%]",
            "border-t border-t-[rgba(255,255,255,0.12)] border-b border-b-[rgba(0,0,0,0.4)] border-l border-l-[rgba(255,255,255,0.04)] border-r border-r-[rgba(255,255,255,0.04)]",
            alignClass[align]
        )}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child) && child.type === DropdownMenuItem) {
                    return React.cloneElement(child as React.ReactElement<any>, {
                        onSelect: () => {
                            const originalOnClick = (child.props as any).onClick
                            if (originalOnClick) originalOnClick()
                            onClose?.()
                        }
                    })
                }
                return child
            })}
        </div>
    )
}

interface DropdownMenuItemProps {
    children: React.ReactNode
    onClick?: () => void
    onSelect?: () => void
    className?: string
}

export function DropdownMenuItem({ children, onClick, onSelect, className }: DropdownMenuItemProps) {
    return (
        <button
            onClick={onSelect || onClick}
            className={cn(
                "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                className
            )}
        >
            {children}
        </button>
    )
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
    return <div className={cn("-mx-1 my-1 h-px bg-border", className)} />
}

