'use server'
// =============================================================================
// app/family/actions.ts — server actions for the family area
//
// sendFamilyMessage — a parent / adult pupil replies to their teacher.
// The teacher id is bound by the page, but it's re-checked here against the
// signed-in person's own links (requireFamily + linkForTeacher) — the
// conversation is always worked out from their link, never from form data.
// =============================================================================
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { linkForTeacher, requireFamily } from '@/lib/family'
import { conversationFor, postMessage } from '@/lib/messages'
import { FormError, handle, str, type ActionState } from '@/lib/forms'

export async function sendFamilyMessage(teacherId: string, _state: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const ctx = await requireFamily()
    const link = linkForTeacher(ctx, teacherId)
    if (!link) throw new FormError('You can’t message this teacher from your account.')

    const target = link.kind === 'guardian' && link.guardianId ? { guardianId: link.guardianId } : link.studentId ? { studentId: link.studentId } : null
    if (!target) throw new FormError('You can’t message this teacher from your account.')

    const body = str(fd, 'body')
    if (!body) throw new FormError('Write a message first.')

    const conversation = await conversationFor(link.teacher.id, target)
    const { data: teacher, error } = await db().from('teachers').select('*').eq('id', link.teacher.id).single()
    if (error || !teacher) throw new FormError('We couldn’t find your teacher’s account. Please try again later.')

    await postMessage({ teacher, conversation, sender: 'family', senderEmail: ctx.email, senderName: link.contactName, body })
    revalidatePath('/family', 'layout')
    return { ok: 'Message sent.' }
  })
}
