'use server'
// =============================================================================
// messages/actions.ts — the teacher's side of in-app messages
//
// startConversation  "New message" picker → open (or create) the conversation
//                    with a parent/guardian or an ADULT pupil, then go there.
// sendTeacherMessage reply in a conversation. Messages are permanent; the
//                    family gets an email alert (lib/messages.ts).
// Safeguarding: a conversation is never started with, or sent to, an
// under-18 pupil directly — only through their parents.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, requireTeacher } from '@/lib/db'
import { handle, str, FormError, type ActionState } from '@/lib/forms'
import { isMinor } from '@/lib/format'
import { studioName } from '@/lib/email'
import { conversationFor, postMessage, type ConversationTarget } from '@/lib/messages'

const UUID = /^[0-9a-f-]{36}$/i

/** Check a guardian / pupil belongs to this teacher and may be messaged (pupils: adults only). */
async function checkTarget(teacherId: string, target: ConversationTarget): Promise<void> {
  if ('guardianId' in target) {
    const { data } = await db().from('guardians').select('id').eq('id', target.guardianId).eq('teacher_id', teacherId).maybeSingle()
    if (!data) throw new FormError('That contact no longer exists.')
    return
  }
  const { data } = await db().from('students').select('date_of_birth, is_minor').eq('id', target.studentId).eq('teacher_id', teacherId).maybeSingle()
  if (!data) throw new FormError('That pupil no longer exists.')
  if (isMinor(data)) throw new FormError('Pupils under 18 can’t be messaged directly — message their parent instead.')
}

// ---- Start a conversation ---------------------------------------------------------------
export async function startConversation(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = ''
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const [kind, ref] = str(fd, 'who').split(':')
    if (!ref || !UUID.test(ref) || (kind !== 'g' && kind !== 's')) throw new FormError('Choose who to message.')
    const target: ConversationTarget = kind === 'g' ? { guardianId: ref } : { studentId: ref }
    await checkTarget(teacher.id, target)
    id = (await conversationFor(teacher.id, target)).id
  })
  if (result?.error) return result
  revalidatePath('/messages')
  redirect(`/messages/${id}`)
}

// ---- Reply ----------------------------------------------------------------------------------
export async function sendTeacherMessage(conversationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    if (!UUID.test(conversationId)) throw new FormError('Invalid reference.')
    const { data: conversation } = await db()
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('teacher_id', teacher.id)
      .maybeSingle()
    if (!conversation) throw new FormError('That conversation no longer exists.')

    // The contact must still exist, and a pupil must still be an adult
    if (conversation.guardian_id) await checkTarget(teacher.id, { guardianId: conversation.guardian_id })
    else if (conversation.student_id) await checkTarget(teacher.id, { studentId: conversation.student_id })
    else throw new FormError('This contact has been deleted, so the conversation is kept as a record only.')

    await postMessage({
      teacher,
      conversation,
      sender: 'teacher',
      senderEmail: teacher.email,
      senderName: teacher.display_name || studioName(teacher),
      body: str(fd, 'body'),
    })
    revalidatePath('/messages')
    revalidatePath(`/messages/${conversationId}`)
    return { ok: 'Sent.' }
  })
}
