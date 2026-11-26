// =============================================================================
// lib/family-booking.ts — families cancelling and rescheduling lessons
//
// The rules (Hannah's):
//   · 24 hours' notice or more → not charged for the lesson.
//     Cancel: marked "notice given" (a make-up credit when billing in
//     advance; simply not charged in arrears).
//     Reschedule: the lesson MOVES to the new time — same length and price,
//     charged once (in advance, that's the credit being used by the rebook).
//   · Less than 24 hours → still charged.
//     Cancel: marked "absent" (charged, no credit).
//     Reschedule: the original is charged (absent) and the new time is an
//     extra lesson at the usual price.
//   · A different length means contacting the teacher.
//
// freeStartTimes() — when a lesson of this length could start: the teacher's
//   teaching hours minus lessons going ahead and timed events, in 15-minute
//   steps, from 24 hours from now, for the next two weeks. Other pupils'
//   names never leave the server — only times.
// isStartFree() — the same check for one chosen time (re-checked on save).
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { addDaysISO, fmtTz, isoWeekday, rangeBoundsUtc, todayISO, zonedToUtc } from './dates'
import { clock, freeGaps, isCancelled, minutesOf, type Span } from './lessons'
import { holidayOn, holidaysBetween } from './holidays'

export const NOTICE_HOURS = 24
const DAYS_AHEAD = 14 // two weeks — longer, and families message the teacher (Hannah's call)
const STEP = 15

/** Less than 24 hours until the lesson? */
export function isLateNotice(startsAt: string, now = new Date()): boolean {
  return new Date(startsAt).getTime() - now.getTime() < NOTICE_HOURS * 3600_000
}

type TeacherBits = { id: string; timezone: string }

/** Busy spans (minutes) per local date, for the teacher, over a date range. */
async function busyByDate(teacher: TeacherBits, from: string, to: string, excludeLessonId?: string) {
  const [fromUtc, toUtc] = rangeBoundsUtc(from, to, teacher.timezone)
  const [hours, lessons, events] = await Promise.all([
    db().from('teaching_hours').select('day_of_week, starts, ends').eq('teacher_id', teacher.id).then(must),
    db().from('lessons').select('id, starts_at, duration_minutes, status').eq('teacher_id', teacher.id).gte('starts_at', fromUtc).lt('starts_at', toUtc).then(must),
    db().from('events').select('event_date, starts, ends').eq('teacher_id', teacher.id).gte('event_date', from).lte('event_date', to).not('starts', 'is', null).then(must),
  ])
  const busy = new Map<string, Span[]>()
  const add = (d: string, s: Span) => busy.set(d, [...(busy.get(d) ?? []), s])
  for (const l of lessons) {
    if (l.id === excludeLessonId || isCancelled(l.status)) continue
    const d = fmtTz(l.starts_at, teacher.timezone, 'yyyy-MM-dd')
    const m = minutesOf(fmtTz(l.starts_at, teacher.timezone, 'HH:mm'))
    add(d, { from: m, to: m + l.duration_minutes })
  }
  for (const e of events) {
    const m = minutesOf(e.starts!.slice(0, 5))
    add(e.event_date, { from: m, to: e.ends ? minutesOf(e.ends.slice(0, 5)) : m + 60 })
  }
  return { hours, busy }
}

export type FreeDay = { date: string; times: string[] }

export async function freeStartTimes(teacher: TeacherBits, durationMinutes: number, excludeLessonId?: string, now = new Date()): Promise<FreeDay[]> {
  const today = todayISO(teacher.timezone)
  const last = addDaysISO(today, DAYS_AHEAD)
  const { hours, busy } = await busyByDate(teacher, today, last, excludeLessonId)
  const holidays = await holidaysBetween(teacher.id, today, last)
  const earliest = now.getTime() + NOTICE_HOURS * 3600_000
  const out: FreeDay[] = []
  for (let d = today; d <= last; d = addDaysISO(d, 1)) {
    // No free time on holidays / term breaks
    const dayHours = holidayOn(d, holidays) ? [] : hours.filter((h) => h.day_of_week === isoWeekday(d))
    if (!dayHours.length) continue
    const times: string[] = []
    for (const g of freeGaps(dayHours, busy.get(d) ?? [], durationMinutes)) {
      // Start on a quarter hour, and leave the teacher 24 hours' notice
      for (let m = Math.ceil(g.from / STEP) * STEP; m + durationMinutes <= g.to; m += STEP) {
        const t = clock(m)
        if (new Date(zonedToUtc(d, t, teacher.timezone)).getTime() >= earliest) times.push(t)
      }
    }
    if (times.length) out.push({ date: d, times })
  }
  return out
}

/** Is this exact start time still free (inside hours, no clash, 24h ahead)? */
export async function isStartFree(teacher: TeacherBits, date: string, time: string, durationMinutes: number, excludeLessonId?: string): Promise<boolean> {
  const days = await freeStartTimes(teacher, durationMinutes, excludeLessonId)
  return !!days.find((d) => d.date === date)?.times.includes(time)
}
