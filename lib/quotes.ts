// =============================================================================
// lib/quotes.ts — funny quote of the day for TEACHERS (never shown to families)
//
// One quote from data/teacher-quotes.json per calendar day, same rotation
// idea as lib/tips.ts (every quote shown once before any repeats). The quotes
// are written for Lindon. To add or edit some, change the JSON file.
// =============================================================================
import quotes from '@/data/teacher-quotes.json'
import { diffDays } from './dates'

const ALL = quotes as string[]
const EPOCH = '2026-01-01'

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
function stride(n: number): number {
  for (let s = 23; s < n + 23; s++) if (gcd(s, n) === 1) return s % n || 1
  return 1
}

/** The quote for a calendar date (YYYY-MM-DD). */
export function quoteForDate(dateISO: string): string {
  const n = ALL.length
  const day = ((diffDays(EPOCH, dateISO) % n) + n) % n
  return ALL[(day * stride(n)) % n]
}
