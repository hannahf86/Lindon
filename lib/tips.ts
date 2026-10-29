// =============================================================================
// lib/tips.ts — tip of the day
//
// One tip from data/daily-tips.json per calendar day. Everyone sees the same
// tip on the same day (it changes at midnight in the viewer's timezone).
// Days step through the list in jumps of STRIDE so the categories mix day to
// day, and every tip is shown once before any repeats (STRIDE shares no
// factor with the list length). To add or edit tips, change the JSON file.
// =============================================================================
import tips from '@/data/daily-tips.json'
import { diffDays } from './dates'

export type Tip = { id: number; category: string; text: string }

const ALL = tips as Tip[]
const EPOCH = '2026-01-01' // day 0 of the rotation

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
/** A step that visits every tip before repeating, for any list length. */
function stride(n: number): number {
  for (let s = 37; s < n + 37; s++) if (gcd(s, n) === 1) return s % n || 1
  return 1
}

/** The tip for a calendar date (YYYY-MM-DD). */
export function tipForDate(dateISO: string): Tip {
  const n = ALL.length
  const day = ((diffDays(EPOCH, dateISO) % n) + n) % n
  return ALL[(day * stride(n)) % n]
}

/** "power-of-music" → "Power of music" */
export function categoryLabel(category: string): string {
  const s = category.replace(/-/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
