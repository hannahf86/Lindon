'use server'
// =============================================================================
// schedule/holidays/actions.ts — add / remove holidays and term breaks
//
// Adding one re-syncs every regular booking (lib/holidays.ts → applyHolidays)
// so no lessons are made in it; lessons already invoiced in it become
// "teacher cancelled". Optionally tells every family with an announcement
// (in-app messages switched on). Removing one re-syncs too, so the
// bookings' lessons come back (ones already marked cancelled stay as they are).
// =============================================================================
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { bool, date, handle, required, FormError, type ActionState } from '@/lib/forms'
import { fmtDate } from '@/lib/dates'
import { has } from '@/lib/features'
import { applyHolidays } from '@/lib/holidays'
import { announcementTargets } from '@/lib/announcements'
import { conversationFor, postMessage } from '@/lib/messages'
import { studioName } from '@/lib/email'

function refresh() {
  revalidatePath('/schedule', 'layout')
  revalidatePath('/')
  revalidatePath('/family', 'layout')
}

export async function addHoliday(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const name = required(fd, 'name', 'Name')
    const starts_on = date(fd, 'starts_on')
    const ends_on = date(fd, 'ends_on') ?? starts_on
    if (!starts_on || !ends_on) throw new FormError('Pick the first and last day.')
    if (ends_on < starts_on) throw new FormError('The last day is before the first day.')
    must(await db().from('holidays').insert({ teacher_id: teacher.id, name, starts_on, ends_on }).select('id'))
    const { cancelled } = await applyHolidays(teacher)

    // ---- Tell families (optional) ----
    let told = 0
    if (bool(fd, 'announce') && has(teacher, 'messaging')) {
      const when = starts_on === ends_on ? fmtDate(starts_on, 'EEEE d MMMM') : `${fmtDate(starts_on, 'EEEE d MMMM')} to ${fmtDate(ends_on, 'EEEE d MMMM')}`
      const body = `${name}: there are no lessons from ${when}. Lessons carry on as normal afterwards — you won’t be charged for the break.`
      for (const target of await announcementTargets(teacher.id)) {
        const conversation = await conversationFor(teacher.id, target)
        await postMessage({ teacher, conversation, sender: 'teacher', senderEmail: teacher.email, senderName: teacher.display_name || studioName(teacher), body })
        told++
      }
    }
    return {
      ok:
        `${name} added — no lessons will be booked then.` +
        (cancelled ? ` ${cancelled} lesson${cancelled === 1 ? ' that was' : 's that were'} already invoiced ${cancelled === 1 ? 'is' : 'are'} marked “I cancelled”.` : '') +
        (told ? ` ${told} ${told === 1 ? 'family' : 'families'} told.` : ''),
    }
  })
  if (result?.ok) refresh()
  return result
}

export async function removeHoliday(id: string): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FormError('That holiday couldn’t be found.')
    must(await db().from('holidays').delete().eq('id', id).eq('teacher_id', teacher.id).select('id'))
    await applyHolidays(teacher)
    return { ok: 'Holiday removed — regular lessons are booked back in.' }
  })
  if (result?.ok) refresh()
  return result
}
