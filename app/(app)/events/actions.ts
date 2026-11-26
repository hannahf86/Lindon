'use server'
// =============================================================================
// events/actions.ts — calendar events: add (from the calendar's "click a day"
// pop-up), edit and delete. Every query is scoped to the signed-in teacher.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { date, handle, oneOf, required, str, time, FormError, type ActionState } from '@/lib/forms'
import { EVENT_KIND_KEYS } from '@/lib/events'

/** Title, kind, date, optional times, location, notes (shared by add + edit). */
function readEvent(fd: FormData) {
  const event_date = date(fd, 'event_date')
  if (!event_date) throw new FormError('Date is required.')
  const starts = time(fd, 'starts', 'Start time')
  const ends = time(fd, 'ends', 'End time')
  if (ends && !starts) throw new FormError('Add a start time too, or leave both empty for an all-day event.')
  if (starts && ends && ends <= starts) throw new FormError('The end time needs to be after the start time.')
  return {
    title: required(fd, 'title', 'Title'),
    kind: oneOf(fd, 'kind', EVENT_KIND_KEYS, 'other'),
    event_date,
    starts,
    ends,
    location: str(fd, 'location'),
    notes: str(fd, 'notes'),
  }
}

function revalidateEvents(id?: string) {
  revalidatePath('/schedule', 'layout')
  revalidatePath('/')
  if (id) revalidatePath(`/events/${id}`)
}

// ---- Add (stays on the calendar) ----------------------------------------------------
export async function createEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const e = readEvent(fd)
    must(await db().from('events').insert({ ...e, teacher_id: teacher.id }).select('id').single())
    return { ok: `${e.title} added.` }
  })
  if (result?.ok) revalidateEvents()
  return result
}

// ---- Edit -------------------------------------------------------------------------------
export async function updateEvent(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    must(await db().from('events').update(readEvent(fd)).eq('id', id).eq('teacher_id', teacher.id).select('id').single())
    return { ok: 'Event saved.' }
  })
  if (result?.ok) revalidateEvents(id)
  return result
}

// ---- Delete (back to that day on the schedule) -------------------------------------------
export async function deleteEvent(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  const rows = must(await db().from('events').delete().eq('id', id).eq('teacher_id', teacher.id).select('event_date'))
  revalidateEvents(id)
  redirect(rows[0] ? `/schedule?view=day&date=${rows[0].event_date}` : '/schedule')
}
