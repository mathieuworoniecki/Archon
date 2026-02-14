import { Users, Building2, MapPin, Hash, Calendar } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ─── Shared Entity Type Configuration ────────────────────────────────────────
// Single source of truth for entity type visuals (icon, color).
// Labels come from i18n — use getEntityLabel() instead of hardcoding.

export type EntityType = 'PER' | 'ORG' | 'LOC' | 'MISC' | 'DATE'

export interface EntityTypeConfig {
    icon: LucideIcon
    color: string      // Tailwind text-color class
    bg: string         // Background/border utility classes
    ring: string       // Focus ring utility class
}

export const ENTITY_TYPES: Record<EntityType, EntityTypeConfig> = {
    PER:  { icon: Users,    color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20',    ring: 'ring-blue-500/30' },
    ORG:  { icon: Building2, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', ring: 'ring-emerald-500/30' },
    LOC:  { icon: MapPin,   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',   ring: 'ring-amber-500/30' },
    MISC: { icon: Hash,     color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20',  ring: 'ring-purple-500/30' },
    DATE: { icon: Calendar, color: 'text-pink-400',    bg: 'bg-pink-500/10 border-pink-500/20',       ring: 'ring-pink-500/30' },
}

// ─── i18n label resolution ───────────────────────────────────────────────────
// Maps entity type keys to their i18n translation keys.
// This avoids hardcoding French labels in component code.

const ENTITY_LABEL_KEYS: Record<EntityType, string> = {
    PER:  'entities.people',
    ORG:  'entities.organizations',
    LOC:  'entities.locations',
    MISC: 'entities.misc',
    DATE: 'entities.dates',
}

/**
 * Returns the translated label for an entity type.
 * Usage: `getEntityLabel('PER', t)` → "Personnes" (FR) / "People" (EN)
 */
export function getEntityLabel(type: EntityType, t: (key: string) => string): string {
    return t(ENTITY_LABEL_KEYS[type] ?? 'entities.misc')
}
