// =============================================================================
// lib/lessons.ts — small pure helpers for time slots, lessons and the schedule
// (clock maths, booking dates & frequency, overlap checks, "skip these dates"
// parsing, wording).
// No server-only imports, so server and client components can both use it.
// =============================================================================
import { FormError } from './forms'
import { addDaysISO, diffDays, fmtDate, fmtTz, isoWeekday } from './dates'

export const LESSON_STATUSES = ['scheduled', 'present', 'absent', 'notice_given', 'teacher_cancelled'] as const

/** Attendance choices, in the order the teacher sees them. */
export const ATTENDANCE_OPTIONS = [
  { value: 'scheduled', label: 'Not yet' },
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent (no credit)' },
  { value: 'notice_given', label: 'Notice given (credit)' },
  { value: 'teacher_cancelled', label: 'Teacher cancelled (credit)' },
] as const

/** Statuses where the lesson didn't happen and a make-up credit is issued. */
export const CREDIT_STATUSES = ['notice_given', 'teacher_cancelled'] as const

/** Lesson didn't go ahead (cancelled by either side, with notice) */
export function isCancelled(status: string): boolean {
  return status === 'notice_given' || status === 'teacher_cancelled'
}

// ---- Clock maths -------------------------------------------------------------
/** "16:30" or "16:30:00" → minutes after midnight */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** "16:30" + 45 → "17:15" (wraps past midnight) */
export function endTime(start: string, durationMinutes: number): string {
  const total = (minutesOf(start) + durationMinutes) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// ---- Bookings (start, end, frequency) -----------------------------------------
/** The booking fields of a time slot. */
export type BookingLike = {
  day_of_week: number
  starts_on: string | null
  ends_on: string | null
  repeat_weeks: number
  skip_dates: string[]
}

export const REPEAT_OPTIONS = [
  { value: '1', label: 'Every week' },
  { value: '2', label: 'Every 2 weeks' },
  { value: '3', label: 'Every 3 weeks' },
  { value: '4', label: 'Every 4 weeks' },
] as const

/** "every week" / "every 2 weeks" */
export function frequencyText(repeatWeeks: number): string {
  return repeatWeeks <= 1 ? 'every week' : `every ${repeatWeeks} weeks`
}

/** The first date on or after dateISO that falls on the given ISO weekday. */
export function alignToWeekday(dateISO: string, isoDay: number): string {
  return addDaysISO(dateISO, (isoDay - isoWeekday(dateISO) + 7) % 7)
}

/** Is this calendar date one of the booking's lesson dates? */
export function isBookingDate(b: BookingLike, dateISO: string): boolean {
  if (isoWeekday(dateISO) !== b.day_of_week) return false
  if (!b.starts_on) return true // older open-ended bookings: every week
  if (dateISO < b.starts_on || (b.ends_on && dateISO > b.ends_on)) return false
  if (diffDays(b.starts_on, dateISO) % (7 * Math.max(1, b.repeat_weeks)) !== 0) return false
  return !b.skip_dates.includes(dateISO)
}

/** Every lesson date of the booking between two dates (inclusive). */
export function bookingDates(b: BookingLike, fromISO: string, toISO: string): string[] {
  const step = 7 * Math.max(1, b.repeat_weeks)
  const anchor = b.starts_on ?? alignToWeekday(fromISO, b.day_of_week)
  const last = b.ends_on && b.ends_on < toISO ? b.ends_on : toISO
  // First pattern date on or after `from`
  let d = anchor
  if (d < fromISO) d = addDaysISO(anchor, Math.ceil(diffDays(anchor, fromISO) / step) * step)
  const out: string[] = []
  for (let i = 0; d <= last && i < 600; i++, d = addDaysISO(d, step)) {
    if (!b.skip_dates.includes(d)) out.push(d)
  }
  return out
}

/** The date of the n-th lesson (skipping skip dates) — for "number of lessons". */
export function endAfterLessons(startISO: string, lessons: number, repeatWeeks: number, skip: string[]): string {
  const step = 7 * Math.max(1, repeatWeeks)
  let d = startISO
  let counted = skip.includes(d) ? 0 : 1
  for (let i = 0; counted < lessons && i < 600; i++) {
    d = addDaysISO(d, step)
    if (!skip.includes(d)) counted++
  }
  return d
}

/** "every 2 weeks · 6 Jan – 17 Feb" style summary of a booking. */
export function bookingSummary(b: BookingLike): string {
  const freq = frequencyText(b.repeat_weeks)
  if (!b.starts_on) return `${freq} · no end date set`
  const range = `${fmtDate(b.starts_on, 'd MMM')} – ${b.ends_on ? fmtDate(b.ends_on, 'd MMM yyyy') : 'no end date'}`
  return `${freq} · ${range}`
}

// ---- Overlapping slots -------------------------------------------------------
type SlotLike = { id: string; day_of_week: number; start_time: string; duration_minutes: number; active: boolean } & Partial<BookingLike> & {
  student_id?: string | null
}

/** Booked slots use their booking dates; unbooked (or older) slots count as every week. */
function asBooking(s: SlotLike): BookingLike {
  const booked = !!s.student_id && !!s.starts_on
  return {
    day_of_week: s.day_of_week,
    starts_on: booked ? (s.starts_on ?? null) : null,
    ends_on: booked ? (s.ends_on ?? null) : null,
    repeat_weeks: booked ? (s.repeat_weeks ?? 1) : 1,
    skip_dates: booked ? (s.skip_dates ?? []) : [],
  }
}

/** Do two slots ever actually have lessons on the same date? (Alternate fortnights don't clash.) */
function shareADate(a: SlotLike, b: SlotLike): boolean {
  const ba = asBooking(a)
  const bb = asBooking(b)
  if (!ba.starts_on && !bb.starts_on) return true
  const from = [ba.starts_on, bb.starts_on].filter(Boolean).sort()[0] as string
  const to = addDaysISO(from, 7 * 52)
  const set = new Set(bookingDates(ba, from, to))
  return bookingDates(bb, from, to).some((d) => set.has(d))
}

/**
 * For each active slot, the other active slots on the same day whose times
 * overlap it on at least one real date. Used to warn (never block).
 */
export function findOverlaps<T extends SlotLike>(slots: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  const active = slots.filter((s) => s.active)
  for (const a of active) {
    const aStart = minutesOf(a.start_time)
    const aEnd = aStart + a.duration_minutes
    const clashes = active.filter((b) => {
      if (b.id === a.id || b.day_of_week !== a.day_of_week) return false
      const bStart = minutesOf(b.start_time)
      return bStart < aEnd && aStart < bStart + b.duration_minutes && shareADate(a, b)
    })
    if (clashes.length) out.set(a.id, clashes)
  }
  return out
}

// ---- "Skip these dates" ------------------------------------------------------
/**
 * Parse a typed list of dates (comma, space or new-line separated) into
 * YYYY-MM-DD strings. Accepts 2026-10-27 and UK style 27/10/2026 (or 27/10/26).
 * A range like "27/10/2026 - 31/10/2026" or "2026-10-27 to 2026-10-31" skips every day in between.
 */
export function parseDateList(input: string): Set<string> {
  const out = new Set<string>()
  const text = input.trim()
  if (!text) return out

  const toISO = (raw: string): string => {
    const s = raw.trim()
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (m) return valid(+m[1], +m[2], +m[3], raw)
    m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/)
    if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1], raw)
    throw new FormError(`Skip dates: "${raw}" isn't a date I recognise. Try 27/10/2026 or 2026-10-27.`)
  }
  const valid = (y: number, mo: number, d: number, raw: string) => {
    const dt = new Date(Date.UTC(y, mo - 1, d))
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
      throw new FormError(`Skip dates: "${raw}" isn't a real date.`)
    }
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // Ranges first ("a - b", "a to b"), then single dates
  for (const part of text.split(/[,;\n]+/)) {
    const p = part.trim()
    if (!p) continue
    const range = p.match(/^(\S+)\s*(?:-|–|to)\s*(\S+)$/i)
    if (range && !/^\d{4}-\d{1,2}-\d{1,2}$/.test(p)) {
      let cur = toISO(range[1])
      const end = toISO(range[2])
      if (end < cur) throw new FormError(`Skip dates: "${p}" ends before it starts.`)
      for (let i = 0; i < 400 && cur <= end; i++) {
        out.add(cur)
        const [y, m, d] = cur.split('-').map(Number)
        const next = new Date(Date.UTC(y, m - 1, d + 1))
        cur = next.toISOString().slice(0, 10)
      }
      continue
    }
    for (const word of p.split(/\s+/)) if (word) out.add(toISO(word))
  }
  return out
}

// ---- Wording -------------------------------------------------------------------
/** "Tuesday 7 October at 16:30" in the teacher's timezone (used in reminders). */
export function lessonWhen(startsAt: string, timeZone: string): string {
  return fmtTz(startsAt, timeZone, "EEEE d MMMM 'at' HH:mm")
}

export { currencySymbol } from '@/lib/format'
