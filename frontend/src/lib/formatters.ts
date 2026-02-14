export const formatNumber = (n: number): string => n.toLocaleString()
export const formatEstimatedNumber = (n: number, estimated?: boolean): string => `${formatNumber(n)}${estimated ? '+' : ''}`

export const formatDuration = (start: string, end?: string, seconds?: number): string => {
    let s: number
    if (seconds !== undefined) {
        s = seconds
    } else {
        const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
        s = Math.floor(ms / 1000)
    }
    if (s < 60) return `${s}s`
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}
