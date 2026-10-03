// =============================================================================
// lib/dates.ts — timezone-aware date helpers
//
// Lessons are stored as UTC timestamps (lessons.starts_at). Everything the
// teacher sees or types is in their own timezone (teachers.timezone), so all
// conversion goes through here. Plain calendar dates are "YYYY-MM-DD" strings.
// =============================================================================
import { TZDate, tz } from '@date-fns/tz'
import { format, parseISO } from 'date-fns'

const pad = (n: number) => String(n).padStart(2, '0')

/** Today's date (YYYY-MM-DD) in the given timezone. */
export function todayISO(timeZone: string): string {
  return format(new TZDate(Date.now(), timeZone), 'yyyy-MM-dd')
}

/** Wall-clock date + time in `timeZone` → UTC ISO string for the database. */
export function zonedToUtc(dateISO: string, time: string, timeZone: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new TZDate(y, m - 1, d, hh, mm, 0, timeZone).toISOString()
}

/** Format a UTC timestamp in the teacher's timezone (date-fns pattern). */
export function fmtTz(iso: string, timeZone: string, pattern: string): string {
  return format(parseISO(iso), pattern, { in: tz(timeZone) })
}

/** UTC timestamp → { date: "YYYY-MM-DD", time: "HH:MM" } in the teacher's timezone. */
export function utcToZonedParts(iso: string, timeZone: string): { date: string; time: string } {
  return { date: fmtTz(iso, timeZone, 'yyyy-MM-dd'), time: fmtTz(iso, timeZone, 'HH:mm') }
}

/** UTC bounds [start, end) of a local calendar day — for "lessons today" queries. */
export function dayBoundsUtc(dateISO: string, timeZone: string): [string, string] {
  return [zonedToUtc(dateISO, '00:00', timeZone), zonedToUtc(addDaysISO(dateISO, 1), '00:00', timeZone)]
}

/** UTC bounds [start, end) of a range of local days (end date inclusive). */
export function rangeBoundsUtc(fromISO: string, toISO: string, timeZone: string): [string, string] {
  return [zonedToUtc(fromISO, '00:00', timeZone), zonedToUtc(addDaysISO(toISO, 1), '00:00', timeZone)]
}

export function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** Whole days from a to b (b - a) between two YYYY-MM-DD dates. */
export function diffDays(aISO: string, bISO: string): number {
  return Math.round((Date.parse(bISO + 'T00:00:00Z') - Date.parse(aISO + 'T00:00:00Z')) / 86_400_000)
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number)
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return js === 0 ? 7 : js
}

/** The Monday on or before the given date. */
export function weekStartISO(dateISO: string): string {
  return addDaysISO(dateISO, 1 - isoWeekday(dateISO))
}

/** First and last day of the month containing dateISO. */
export function monthBounds(dateISO: string): [string, string] {
  const [y, m] = dateISO.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(last)}`]
}

/** "2026-10-03" → "Sat 3 Oct 2026" (or a custom date-fns pattern). */
export function fmtDate(dateISO: string | null | undefined, pattern = 'EEE d MMM yyyy'): string {
  if (!dateISO) return ''
  return format(parseISO(dateISO), pattern)
}

/** Is this a valid YYYY-MM-DD string? */
export function isDateISO(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
}
