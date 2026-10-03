// =============================================================================
// lib/bookings.ts — keep a slot's lessons in step with its booking
//
// A booking = the pupil in a time slot, from a first lesson date to a last
// lesson date, every N weeks, minus any skipped dates. Nothing repeats
// forever: lessons only exist up to the booking's end date.
//
// syncSlotLessons() makes the slot's lessons (from a given date onwards)
// match the booking exactly:
//   • a booked date with no lesson          → lesson created
//   • a booked date with a scheduled lesson → updated (time, pupil, price…)
//   • a scheduled lesson on a date that's no longer booked → removed,
//     UNLESS it's already on an invoice (then it's kept and reported)
//   • completed / cancelled / missed lessons are never touched
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { todayISO, utcToZonedParts, zonedToUtc } from './dates'
import { bookingDates } from './lessons'
import type { Teacher, TimeSlot } from './database.types'

export type SyncResult = { created: number; updated: number; removed: number; keptInvoiced: number }

export async function syncSlotLessons(teacher: Teacher, slot: TimeSlot, fromDate?: string): Promise<SyncResult> {
  const tz = teacher.timezone
  const result: SyncResult = { created: 0, updated: 0, removed: 0, keptInvoiced: 0 }
  const from = fromDate ?? todayISO(tz)

  // Older open-ended bookings (no end date yet) are left alone until one is set
  if (slot.student_id && slot.active && !slot.ends_on) return result

  // ---- The dates the booking says should have lessons ----
  const booked = slot.student_id && slot.active && slot.starts_on && slot.ends_on
  const startFrom = booked && slot.starts_on! > from ? slot.starts_on! : from
  const desired = booked ? bookingDates(slot, startFrom, slot.ends_on!) : []
  const wanted = new Set(desired)

  // ---- The slot's existing lessons from `from` onwards ----
  const existing = must(
    await db()
      .from('lessons')
      .select('id, starts_at, status, student_id')
      .eq('teacher_id', teacher.id)
      .eq('time_slot_id', slot.id)
      .gte('starts_at', zonedToUtc(from, '00:00', tz)),
  )

  // Which of them are on a live (non-void) invoice?
  const invoiced = new Set<string>()
  if (existing.length) {
    const items = must(
      await db()
        .from('invoice_items')
        .select('lesson_id, invoices!inner(status)')
        .eq('teacher_id', teacher.id)
        .in('lesson_id', existing.map((l) => l.id))
        .neq('invoices.status', 'void'),
    )
    for (const it of items) if (it.lesson_id) invoiced.add(it.lesson_id)
  }

  const startTime = slot.start_time.slice(0, 5)
  const covered = new Set<string>()
  const toDelete: string[] = []

  for (const l of existing) {
    const date = utcToZonedParts(l.starts_at, tz).date
    if (wanted.has(date) && !covered.has(date)) {
      covered.add(date)
      if (l.status !== 'scheduled') continue // completed / cancelled: leave as is
      const starts_at = zonedToUtc(date, startTime, tz)
      must(
        await db()
          .from('lessons')
          .update({
            starts_at,
            student_id: slot.student_id!,
            duration_minutes: slot.duration_minutes,
            price: slot.price,
            instrument: slot.instrument,
            location: slot.location,
            ...(starts_at !== new Date(l.starts_at).toISOString() ? { reminder_sent_at: null } : {}),
          })
          .eq('id', l.id)
          .eq('teacher_id', teacher.id)
          .select('id'),
      )
      result.updated++
    } else if (l.status === 'scheduled') {
      if (invoiced.has(l.id)) result.keptInvoiced++
      else toDelete.push(l.id)
    }
  }

  if (toDelete.length) {
    must(await db().from('lessons').delete().eq('teacher_id', teacher.id).in('id', toDelete).select('id'))
    result.removed = toDelete.length
  }

  // ---- Create lessons for booked dates that don't have one ----
  const fresh = desired
    .filter((d) => !covered.has(d))
    .map((d) => ({
      teacher_id: teacher.id,
      student_id: slot.student_id!,
      time_slot_id: slot.id,
      starts_at: zonedToUtc(d, startTime, tz),
      duration_minutes: slot.duration_minutes,
      price: slot.price,
      instrument: slot.instrument,
      location: slot.location,
    }))
  if (fresh.length) {
    must(await db().from('lessons').insert(fresh).select('id'))
    result.created = fresh.length
  }
  return result
}

/** Plain-English summary of a sync for the confirmation message. */
export function syncMessage(r: SyncResult): string {
  const parts: string[] = []
  if (r.created) parts.push(`${r.created} lesson${r.created === 1 ? '' : 's'} added`)
  if (r.updated) parts.push(`${r.updated} updated`)
  if (r.removed) parts.push(`${r.removed} removed`)
  let msg = parts.length ? parts.join(', ') + '.' : 'Lessons already matched — nothing to change.'
  if (r.keptInvoiced) msg += ` ${r.keptInvoiced} lesson${r.keptInvoiced === 1 ? ' is' : 's are'} outside the booking now but already invoiced, so ${r.keptInvoiced === 1 ? 'it was' : 'they were'} kept — check the invoice.`
  return msg
}
