'use server'
// =============================================================================
// schedule/slots/actions.ts — create / update / delete weekly time slots.
// A booked slot has a booking (first lesson, how often, last lesson); saving
// it creates/updates that pupil's lessons to match (see lib/bookings.ts).
// Every query is scoped to the signed-in teacher.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { bool, date, handle, int, num, oneOf, parseTime, ref, required, str, FormError, type ActionState } from '@/lib/forms'
import { diffDays, todayISO } from '@/lib/dates'
import { alignToWeekday, endAfterLessons, parseDateList } from '@/lib/lessons'
import { syncSlotLessons, syncMessage } from '@/lib/bookings'

const DAYS = ['1', '2', '3', '4', '5', '6', '7'] as const
const REPEATS = ['1', '2', '3', '4'] as const

/** Read the slot form into a row (shared by create + update). */
function readSlot(fd: FormData, timeZone: string) {
  const day_of_week = Number(oneOf(fd, 'day_of_week', DAYS, '1'))
  const student_id = ref(fd, 'student_id')
  const base = {
    day_of_week,
    start_time: parseTime(required(fd, 'start_time', 'Start time'), 'Start time'),
    duration_minutes: int(fd, 'duration_minutes', 'Length (minutes)', { min: 5, max: 600 }),
    price: num(fd, 'price', 'Price', { min: 0, fallback: 0 }),
    label: str(fd, 'label'),
    instrument: str(fd, 'instrument'),
    location: str(fd, 'location'),
    notes: str(fd, 'notes'),
    active: bool(fd, 'active'),
    student_id,
  }
  // No pupil: no booking
  if (!student_id) return { ...base, starts_on: null, ends_on: null, repeat_weeks: 1, skip_dates: [] as string[] }

  // ---- Booking: first lesson, frequency, end (date or number of lessons) ----
  const repeat_weeks = Number(oneOf(fd, 'repeat_weeks', REPEATS, '1'))
  const typedStart = date(fd, 'starts_on')
  // Line the first lesson up with the slot's day (e.g. a Saturday date on a Tuesday slot → the next Tuesday)
  const starts_on = alignToWeekday(typedStart ?? todayISO(timeZone), day_of_week)
  const skip_dates = [...parseDateList(str(fd, 'skip_dates'))].sort()
  const count = str(fd, 'lesson_count') ? int(fd, 'lesson_count', 'Number of lessons', { min: 1, max: 200 }) : null
  const ends_on = count ? endAfterLessons(starts_on, count, repeat_weeks, skip_dates) : date(fd, 'ends_on')
  if (!ends_on) throw new FormError('When does this booking end? Pick the last lesson date, or type a number of lessons.')
  if (ends_on < starts_on) throw new FormError('The last lesson is before the first lesson.')
  if (diffDays(starts_on, ends_on) > 7 * 60) throw new FormError('That booking is over a year long — book a term or half term at a time.')
  return { ...base, starts_on, ends_on, repeat_weeks, skip_dates }
}

function revalidateSlots(studentIds: (string | null | undefined)[]) {
  revalidatePath('/schedule/slots')
  revalidatePath('/schedule')
  revalidatePath('/lessons')
  revalidatePath('/')
  for (const s of new Set(studentIds)) if (s) revalidatePath(`/students/${s}`)
}

const savedUrl = (id: string, msg: string) => `/schedule/slots?saved=${id}&msg=${encodeURIComponent(msg)}#slot-${id}`

/** Where to go after saving: back to a pupil's page if the edit started there. */
function afterSave(fd: FormData, id: string, msg: string): string {
  const back = str(fd, 'return_to')
  if (/^\/students\/[0-9a-f-]{36}$/i.test(back)) return `${back}?booking=${encodeURIComponent(msg)}`
  return savedUrl(id, msg)
}

// ---- Create ------------------------------------------------------------------------
// Booking a pupil creates their lessons straight away, up to the end date.
export async function createSlot(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = ''
  let msg = ''
  let studentId: string | null = null
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const row = readSlot(fd, teacher.timezone)
    studentId = row.student_id
    const slot = must(await db().from('time_slots').insert({ ...row, teacher_id: teacher.id }).select('*').single())
    id = slot.id
    if (slot.student_id) msg = syncMessage(await syncSlotLessons(teacher, slot, slot.starts_on ?? undefined))
  })
  if (result?.error) return result
  revalidateSlots([studentId])
  redirect(afterSave(fd, id, msg))
}

// ---- Update ------------------------------------------------------------------------
// Upcoming lessons are brought in line with the booking (moved, added past a
// new end date, removed before an earlier one) unless the teacher unticks it.
export async function updateSlot(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let touched: (string | null)[] = []
  let msg = ''
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const row = readSlot(fd, teacher.timezone)
    const { data: before } = await db().from('time_slots').select('student_id').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
    const slot = must(await db().from('time_slots').update(row).eq('id', id).eq('teacher_id', teacher.id).select('*').single())
    touched = [before?.student_id ?? null, row.student_id]

    const sync = !fd.has('update_lessons_shown') || bool(fd, 'update_lessons')
    if (sync) msg = syncMessage(await syncSlotLessons(teacher, slot))
  })
  if (result?.error) return result
  revalidateSlots(touched)
  redirect(afterSave(fd, id, msg))
}

// ---- End a booking (from the pupil's page) ---------------------------------------
// Takes the pupil out of the slot: their future booked lessons from it are
// removed (unless already invoiced), past lessons and notes are kept, and the
// slot itself stays on the timetable as free.
export async function endBooking(slotId: string): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const { data: before } = await db().from('time_slots').select('student_id').eq('id', slotId).eq('teacher_id', teacher.id).maybeSingle()
    if (!before?.student_id) throw new FormError('That booking has already ended.')
    const slot = must(
      await db()
        .from('time_slots')
        .update({ student_id: null, starts_on: null, ends_on: null, repeat_weeks: 1, skip_dates: [] })
        .eq('id', slotId)
        .eq('teacher_id', teacher.id)
        .select('*')
        .single(),
    )
    const r = await syncSlotLessons(teacher, slot)
    revalidateSlots([before.student_id])
    return {
      ok:
        `Booking ended — the slot is free again.` +
        (r.removed ? ` ${r.removed} upcoming lesson${r.removed === 1 ? '' : 's'} removed.` : '') +
        (r.keptInvoiced ? ` ${r.keptInvoiced} already-invoiced lesson${r.keptInvoiced === 1 ? ' was' : 's were'} kept — check the invoice.` : ''),
    }
  })
}

// ---- Delete ------------------------------------------------------------------------
// Lessons already made from the slot are kept (they just lose the link).
export async function deleteSlot(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  const rows = must(await db().from('time_slots').delete().eq('id', id).eq('teacher_id', teacher.id).select('student_id'))
  revalidateSlots(rows.map((r) => r.student_id))
  redirect('/schedule/slots')
}
