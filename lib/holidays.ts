// =============================================================================
// lib/holidays.ts — holidays and term breaks (table holidays)
//
// holidaysBetween()  — the teacher's holidays overlapping a date range
// holidayOn()        — which holiday (if any) a date falls in
// applyHolidays()    — after adding / removing a holiday: re-sync every
//                      regular booking so its lessons skip holiday days (or
//                      come back), then mark any lessons still booked inside
//                      a holiday "teacher cancelled" (those were already on an
//                      invoice: a make-up credit when billing in advance, not
//                      charged in arrears).
// Pure helpers (no DB) are client-safe via holidayOn / inHoliday below.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { addDaysISO, rangeBoundsUtc, todayISO } from './dates'
import { syncSlotLessons } from './bookings'
import type { Teacher } from './database.types'

export type Holiday = { id: string; name: string; starts_on: string; ends_on: string }

export async function holidaysBetween(teacherId: string, from: string, to: string): Promise<Holiday[]> {
  return must(
    await db().from('holidays').select('id, name, starts_on, ends_on').eq('teacher_id', teacherId).lte('starts_on', to).gte('ends_on', from).order('starts_on'),
  )
}

/** The holiday a date falls in, if any. */
export function holidayOn(date: string, holidays: Holiday[]): Holiday | undefined {
  return holidays.find((h) => date >= h.starts_on && date <= h.ends_on)
}

/** Re-sync bookings and tidy lessons after holidays change. Returns lessons cancelled. */
export async function applyHolidays(teacher: Teacher): Promise<{ cancelled: number }> {
  const today = todayISO(teacher.timezone)
  // ---- Every running regular booking: lessons follow the holidays ----
  const slots = must(await db().from('time_slots').select('*').eq('teacher_id', teacher.id).eq('active', true).not('student_id', 'is', null).not('starts_on', 'is', null))
  for (const slot of slots) await syncSlotLessons(teacher, slot, today)

  // ---- Lessons still booked inside a holiday (already invoiced, or one-offs) ----
  const upcoming = await holidaysBetween(teacher.id, today, addDaysISO(today, 400))
  let cancelled = 0
  for (const h of upcoming) {
    const [from, to] = rangeBoundsUtc(h.starts_on > today ? h.starts_on : today, h.ends_on, teacher.timezone)
    const rows = must(
      await db()
        .from('lessons')
        .update({ status: 'teacher_cancelled' })
        .eq('teacher_id', teacher.id)
        .eq('status', 'scheduled')
        .gte('starts_at', from)
        .lt('starts_at', to)
        .select('id'),
    )
    cancelled += rows.length
  }
  return { cancelled }
}
