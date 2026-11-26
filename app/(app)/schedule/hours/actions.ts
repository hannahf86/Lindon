'use server'
// =============================================================================
// schedule/hours/actions.ts — add / remove teaching hours (e.g. Sat 09:00–17:00)
// Used by Schedule → Teaching hours and by onboarding. Always the signed-in
// teacher's own rows.
// =============================================================================
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { handle, oneOf, parseTime, required, FormError, type ActionState } from '@/lib/forms'
import { dayName } from '@/lib/format'
import { minutesOf } from '@/lib/lessons'

const DAYS = ['1', '2', '3', '4', '5', '6', '7'] as const

function refresh() {
  revalidatePath('/schedule', 'layout')
  revalidatePath('/welcome')
  revalidatePath('/')
}

export async function addTeachingHours(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const day = Number(oneOf(fd, 'day_of_week', DAYS, '1'))
    const starts = parseTime(required(fd, 'starts', 'From'), 'From')
    const ends = parseTime(required(fd, 'ends', 'To'), 'To')
    if (minutesOf(ends) <= minutesOf(starts)) throw new FormError('The finish time needs to be after the start time.')

    // Don't let blocks on the same day overlap
    const sameDay = must(await db().from('teaching_hours').select('starts, ends').eq('teacher_id', teacher.id).eq('day_of_week', day))
    if (sameDay.some((h) => minutesOf(starts) < minutesOf(h.ends) && minutesOf(h.starts) < minutesOf(ends))) {
      throw new FormError(`That overlaps hours you already teach on ${dayName(day)}. Remove the old block first, or pick different times.`)
    }
    must(await db().from('teaching_hours').insert({ teacher_id: teacher.id, day_of_week: day, starts, ends }).select('id'))
    refresh()
    return { ok: `${dayName(day)} added. Add another day, or carry on.` }
  })
}

export async function removeTeachingHours(id: string): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    must(await db().from('teaching_hours').delete().eq('id', id).eq('teacher_id', teacher.id).select('id'))
    refresh()
    return null
  })
}
