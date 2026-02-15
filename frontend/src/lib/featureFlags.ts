function envBool(value: unknown): boolean {
    if (typeof value !== 'string') return false
    const v = value.trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export const ENABLE_COLLAB_FEATURES = envBool(import.meta.env.VITE_ENABLE_COLLAB)

