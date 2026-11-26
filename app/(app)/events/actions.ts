'use server'
// =============================================================================
// events/actions.ts — calendar events: add (from the calendar's "click a day"
// pop-up), edit and delete. Every query is scoped to the signed-in teacher.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { all, bool, date, handle, oneOf, required, str, time, FormError, type ActionState } from '@/lib/forms'
import { notifyEventFamilies } from '@/lib/event-sharing'
import type { Teacher } from '@/lib/database.types'
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
    ...readSharing(fd),
  }
}

/** Shown to families? Everyone, or which pupils (ids checked against this teacher later). */
function readSharing(fd: FormData) {
  const shared = bool(fd, 'shared')
  const everyone = str(fd, 'share_who') !== 'some'
  const student_ids = everyone ? [] : all(fd, 'share_students').filter((id) => /^[0-9a-f-]{36}$/i.test(id))
  if (shared && !everyone && student_ids.length === 0) throw new FormError('Choose at least one pupil, or show it to everyone.')
  return { shared, everyone, student_ids }
}

/** Keep only this teacher's pupils. */
async function ownPupils(teacher: Teacher, ids: string[]) {
  if (!ids.length) return []
  return must(await db().from('students').select('id').eq('teacher_id', teacher.id).in('id', ids)).map((r) => r.id)
}

function revalidateEvents(id?: string) {
  revalidatePath('/family', 'layout')
  revalidatePath('/schedule', 'layout')
  revalidatePath('/')
  if (id) revalidatePath(`/events/${id}`)
}

// ---- Add (stays on the calendar) ----------------------------------------------------
export async function createEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const e = readEvent(fd)
    e.student_ids = await ownPupils(teacher, e.student_ids)
    const row = must(await db().from('events').insert({ ...e, teacher_id: teacher.id }).select('id').single())
    const told = e.shared && bool(fd, 'notify') ? await notifyEventFamilies(teacher, { ...e, id: row.id, teacher_id: teacher.id }) : 0
    return { ok: `${e.title} added.${told ? ` ${told} ${told === 1 ? 'family' : 'families'} asked who’s coming.` : ''}` }
  })
  if (result?.ok) revalidateEvents()
  return result
}

// ---- Edit -------------------------------------------------------------------------------
export async function updateEvent(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const e = readEvent(fd)
    e.student_ids = await ownPupils(teacher, e.student_ids)
    must(await db().from('events').update(e).eq('id', id).eq('teacher_id', teacher.id).select('id').single())
    const told = e.shared && bool(fd, 'notify') ? await notifyEventFamilies(teacher, { ...e, id, teacher_id: teacher.id }) : 0
    return { ok: `Event saved.${told ? ` ${told} ${told === 1 ? 'family' : 'families'} messaged.` : ''}` }
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
