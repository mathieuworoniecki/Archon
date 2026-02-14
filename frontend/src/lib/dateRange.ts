export function getDateRangeFromParam(dateParam: string): { from: string; to: string } | null {
    const yearMatch = /^(\d{4})$/.exec(dateParam)
    if (yearMatch) {
        const year = Number(yearMatch[1])
        if (Number.isFinite(year)) {
            const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0))
            const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
            return { from: from.toISOString(), to: to.toISOString() }
        }
    }

    const monthMatch = /^(\d{4})-(\d{2})$/.exec(dateParam)
    if (monthMatch) {
        const year = Number(monthMatch[1])
        const month = Number(monthMatch[2])
        if (month >= 1 && month <= 12) {
            const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
            const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
            return { from: from.toISOString(), to: to.toISOString() }
        }
    }

    const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam)
    if (dayMatch) {
        const year = Number(dayMatch[1])
        const month = Number(dayMatch[2])
        const day = Number(dayMatch[3])
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            const from = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
            const to = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
            return { from: from.toISOString(), to: to.toISOString() }
        }
    }

    return null
}

export function getDateFromDays(days: number): string {
    const date = new Date()
    date.setDate(date.getDate() - days)
    return date.toISOString()
}
