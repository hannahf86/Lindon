// =============================================================================
// lib/booking-check.ts — can this regular lesson go here?
//
// checkBooking() refuses a pupil's regular lesson when:
//   · the teacher has teaching hours, but none that day ("not a teaching day")
//   · it doesn't fit inside that day's teaching hours
//   · it clashes with another pupil's booking on a date they share
// Teachers with no teaching hours set at all skip the hours check.
// Throws a FormError with a plain-English reason.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { FormError } from './forms'
import { dayName, fullName, hhmm } from './format'
import { endTime, findOverlaps, withinHours } from './lessons'
import type { Teacher } from './database.types'

export type BookingCandidate = {
  day_of_week: number
  start_time: string // "HH:MM"
  duration_minutes: number
  starts_on: string | null
  ends_on: string | null
  repeat_weeks: number
  skip_dates: string[]
}

export async function checkBooking(teacher: Teacher, c: BookingCandidate, excludeSlotId?: string): Promise<void> {
  const [hours, booked] = await Promise.all([
    db().from('teaching_hours').select('day_of_week, starts, ends').eq('teacher_id', teacher.id).then(must),
    db()
      .from('time_slots')
      .select('id, day_of_week, start_time, duration_minutes, active, student_id, starts_on, ends_on, repeat_weeks, skip_dates, students(first_name, last_name)')
      .eq('teacher_id', teacher.id)
      .eq('active', true)
      .not('student_id', 'is', null)
      .then(must),
  ])

  // ---- Inside teaching hours ----
  if (hours.length) {
    const day = hours.filter((h) => h.day_of_week === c.day_of_week)
    if (day.length === 0) throw new FormError(`${dayName(c.day_of_week)} isn’t one of your teaching days. Add hours for it under Schedule → Teaching hours, or pick another day.`)
    if (!withinHours(day, c.start_time, c.duration_minutes)) {
      const blocks = day.map((h) => `${hhmm(h.starts)}–${hhmm(h.ends)}`).join(' and ')
      throw new FormError(`${c.start_time}–${endTime(c.start_time, c.duration_minutes)} is outside your ${dayName(c.day_of_week)} teaching hours (${blocks}).`)
    }
  }

  // ---- No clash with another pupil ----
  const others = booked.filter((s) => s.id !== excludeSlotId)
  const candidate = { ...c, id: '__new__', active: true, student_id: '__new__' }
  const clash = findOverlaps([...others, candidate]).get('__new__')?.[0]
  if (clash) {
    const pupil = (clash as { students?: { first_name: string; last_name: string } | null }).students
    const who = pupil ? fullName(pupil) : 'another pupil'
    throw new FormError(`That clashes with ${who}’s lesson at ${hhmm(clash.start_time)} on ${dayName(clash.day_of_week)}s.`)
  }
}
