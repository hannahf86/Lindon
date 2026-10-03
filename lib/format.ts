// =============================================================================
// lib/format.ts — display helpers shared by server and client components
// (money, names, ages, durations, statuses). No server-only imports here.
// =============================================================================
import type { Student } from './database.types'

/** £18.00 — uses the teacher's currency code. */
export function money(amount: number | string | null | undefined, currency = 'GBP'): string {
  const n = Number(amount ?? 0)
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n)
  } catch {
    return `${currency} ${n.toFixed(2)}`
  }
}

export function fullName(p: { first_name: string; last_name?: string | null } | null | undefined): string {
  if (!p) return ''
  return [p.first_name, p.last_name].filter(Boolean).join(' ')
}

/** Whole years between date of birth and today (null if no DOB). */
export function ageFrom(dob: string | null | undefined, today = new Date()): number | null {
  if (!dob) return null
  const [y, m, d] = dob.split('-').map(Number)
  let age = today.getFullYear() - y
  const beforeBirthday = today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)
  if (beforeBirthday) age--
  return age
}

/**
 * Under 18? Date of birth wins when we have it (so students "graduate" to
 * adult contact automatically on their 18th birthday); otherwise the
 * teacher's manual choice.
 */
export function isMinor(s: Pick<Student, 'date_of_birth' | 'is_minor'>): boolean {
  const age = ageFrom(s.date_of_birth)
  return age === null ? s.is_minor : age < 18
}

/** 30 → "30 min", 90 → "1 hr 30 min" */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} hr ${m} min` : `${h} hr`
}

/** "16:30:00" → "16:30" */
export function hhmm(time: string | null | undefined): string {
  return (time ?? '').slice(0, 5)
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** ISO weekday (1 = Monday) → "Monday" */
export function dayName(isoDay: number, short = false): string {
  return (short ? DAY_SHORT : DAY_NAMES)[isoDay - 1] ?? ''
}

/** "snake_case" → "Snake case" for status chips */
export function label(value: string): string {
  const s = value.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "GBP" → "£" (falls back to the code itself). */
export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')
    return part?.value ?? currency
  } catch {
    return currency
  }
}

/** Split a typed list ("Piano, Violin; ukulele") into clean unique entries. */
export function splitList(input: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input.split(/[,;\n]/)) {
    const v = raw.trim()
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase())
      out.push(v)
    }
  }
  return out
}
