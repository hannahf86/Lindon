'use server'
// =============================================================================
// family/events/actions.ts — a family answers "Coming" / "Can't make it" for
// one of their pupils (optional note). Only for a shared, upcoming event
// that's for that pupil, from one of their own teachers. Answering again
// changes the answer. The teacher sees replies on the event page.
// =============================================================================
import { revalidatePath } from 'next/cache'
import { db, must } from '@/lib/db'
import { canSeePupil, requireFamily } from '@/lib/family'
import { handle, str, FormError, type ActionState } from '@/lib/forms'
import { todayISO } from '@/lib/dates'

export async function answerEvent(eventId: string, studentId: string, response: 'yes' | 'no', _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const ctx = await requireFamily()
    if (!/^[0-9a-f-]{36}$/i.test(eventId) || !/^[0-9a-f-]{36}$/i.test(studentId) || (response !== 'yes' && response !== 'no')) throw new FormError('Something went wrong — refresh and try again.')
    const { data: e } = await db().from('events').select('id, teacher_id, event_date, shared, everyone, student_ids').eq('id', eventId).maybeSingle()
    if (!e || !e.shared || !canSeePupil(ctx, e.teacher_id, studentId)) throw new FormError('That event couldn’t be found.')
    if (!e.everyone && !e.student_ids.includes(studentId)) throw new FormError('That event couldn’t be found.')
    const link = ctx.links.find((l) => l.teacher.id === e.teacher_id)!
    if (e.event_date < todayISO(link.teacher.timezone)) throw new FormError('This event has already happened.')
    must(
      await db()
        .from('event_responses')
        .upsert({
          event_id: e.id,
          teacher_id: e.teacher_id,
          student_id: studentId,
          response,
          note: str(fd, 'note').slice(0, 500),
          responded_by: ctx.email,
          responded_at: new Date().toISOString(),
        })
        .select('event_id'),
    )
    revalidatePath('/family', 'layout')
    revalidatePath(`/events/${e.id}`)
    return { ok: response === 'yes' ? 'Thanks — see you there!' : 'Thanks for letting us know.' }
  })
}
