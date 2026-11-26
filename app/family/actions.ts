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
import { conversationForLink } from './_lib/family-data'
import { esc, layout, paragraphs } from '@/lib/email-templates'
import { sendEmail } from '@/lib/email'
import { has } from '@/lib/features'
import { FormError, handle, str, type ActionState } from '@/lib/forms'

export async function sendFamilyMessage(teacherId: string, _state: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const ctx = await requireFamily()
    const link = linkForTeacher(ctx, teacherId)
    if (!link || !has(link.teacher, 'messaging')) throw new FormError('You can’t message this teacher from your account.')

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

// ---- "👍 Seen" on one of the teacher's messages (no reply needed) ---------------------------
export async function markMessageSeen(teacherId: string, messageId: string): Promise<ActionState> {
  return handle(async () => {
    const ctx = await requireFamily()
    const link = linkForTeacher(ctx, teacherId)
    if (!link || !has(link.teacher, 'messaging') || !/^[0-9a-f-]{36}$/i.test(messageId)) throw new FormError('That message couldn’t be found.')
    const conversation = await conversationForLink(link)
    if (!conversation) throw new FormError('That message couldn’t be found.')
    // Only the teacher's messages, in THIS family's own conversation
    const { error } = await db()
      .from('messages')
      .update({ seen_at: new Date().toISOString(), read_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('conversation_id', conversation.id)
      .eq('teacher_id', link.teacher.id)
      .eq('sender', 'teacher')
      .is('seen_at', null)
    if (error) throw new Error(error.message)
    revalidatePath('/family/messages')
    revalidatePath('/messages', 'layout')
    return { ok: 'Marked as seen.' }
  })
}

// ---- "I've returned it" for a borrowed item (teacher confirms) -------------------------------
export async function familySaysReturned(loanId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const ctx = await requireFamily()
    if (!/^[0-9a-f-]{36}$/i.test(loanId)) throw new FormError('That item couldn’t be found.')
    const { data: loan } = await db().from('loans').select('id, teacher_id, student_id, returned_on, family_returned_at, library_items(title)').eq('id', loanId).maybeSingle()
    const link = loan && ctx.links.find((l) => l.teacher.id === loan.teacher_id)
    if (!loan || !link || !link.studentIds.includes(loan.student_id)) throw new FormError('That item couldn’t be found.')
    if (loan.returned_on) return { ok: 'Your teacher has already marked it as returned — thank you!' }
    if (loan.family_returned_at) return { ok: 'You’ve already told your teacher — thank you!' }
    const note = str(fd, 'note').slice(0, 500)
    const { error } = await db().from('loans').update({ family_returned_at: new Date().toISOString(), family_return_note: note }).eq('id', loan.id).eq('teacher_id', loan.teacher_id)
    if (error) throw new Error(error.message)

    // ---- Tell the teacher ----
    const { data: teacher } = await db().from('teachers').select('*').eq('id', loan.teacher_id).single()
    if (teacher?.email) {
      const title = loan.library_items?.title ?? 'A borrowed item'
      const who = ctx.name || ctx.email
      await sendEmail({
        teacher,
        to: [teacher.email],
        kind: 'individual',
        email: {
          subject: `${who} says ${title} has been returned`,
          text: `${who} says "${title}" has been returned.${note ? `\n\nTheir note: ${note}` : ''}\n\nCheck it, then mark it returned in Lindon (Library & loans).`,
          html: layout({
            studio: teacher.business_name || teacher.display_name || 'Lindon',
            heading: 'An item’s been returned',
            bodyHtml:
              `<p style="margin:0 0 14px;line-height:1.55">${esc(who)} says <strong>${esc(title)}</strong> has been returned.</p>` +
              (note ? `<div style="background:#EFE9F7;border-radius:14px;padding:14px 16px;margin:0 0 14px"><strong>Their note</strong>${paragraphs(note)}</div>` : '') +
              `<p style="margin:0">Check it, then mark it returned in Library &amp; loans.</p>`,
          }),
        },
      })
    }
    revalidatePath('/family', 'layout')
    revalidatePath('/library', 'layout')
    revalidatePath('/')
    return { ok: 'Thanks! Your teacher will check it and confirm.' }
  })
}
