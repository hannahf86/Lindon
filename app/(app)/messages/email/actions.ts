'use server'
// =============================================================================
// messages/email/actions.ts — compose & send an email to students / their parents
//
// Two steps from one form (the clicked button sets `intent`):
//   check → work out who would receive it and show the list (nothing sent)
//   send  → work it out again (so it's always current) and send
// Under-18s are reached through their linked parents, 18+ directly — see
// lib/recipients.ts. Every send is written to the email log by sendEmail().
// =============================================================================
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/db'
import { all, oneOf, str, FormError } from '@/lib/forms'
import { recipientsFor } from '@/lib/recipients'
import { messageEmail } from '@/lib/email-templates'
import { sendEmail, signature, studioName } from '@/lib/email'
import type { ComposeState } from './types'

const AUDIENCES = ['all', 'choose'] as const

export async function composeEmail(_: ComposeState, fd: FormData): Promise<ComposeState> {
  try {
    const teacher = await requireTeacher()
    const intent = str(fd, 'intent') === 'send' ? 'send' : 'check'
    const audience = oneOf(fd, 'audience', AUDIENCES, 'all')

    // ---- Who's it for? ----
    let ids: string[] | undefined
    if (audience === 'choose') {
      ids = all(fd, 'student_ids')
      if (ids.some((v) => !/^[0-9a-f-]{36}$/i.test(v))) throw new FormError('Invalid reference.')
      if (ids.length === 0) throw new FormError('Tick at least one student, or choose “All active students”.')
    }
    // recipientsFor scopes by teacher_id, so ids from another teacher match nothing
    const { recipients, missing } = await recipientsFor(teacher.id, ids)
    const missingNames = missing.map((m) => m.name)

    if (intent === 'check') {
      return {
        preview: {
          recipients: recipients.map((r) => ({ name: r.name, email: r.email, studentName: r.studentName, via: r.via })),
          missing: missingNames,
        },
      }
    }

    // ---- Send ----
    const subject = str(fd, 'subject')
    const body = str(fd, 'body')
    if (!subject) throw new FormError('Add a subject line.')
    if (!body) throw new FormError('Write your message first.')
    if (recipients.length === 0) throw new FormError('Nobody to send to — none of these students have an email address (or a parent with one).')

    const result = await sendEmail({
      teacher,
      to: recipients.map((r) => r.email),
      email: messageEmail({ studio: studioName(teacher), subject, body, signature: signature(teacher) }),
      kind: ids && ids.length === 1 ? 'individual' : 'broadcast',
    })
    revalidatePath('/messages/email')
    return { sent: { ...result, missing: missingNames } }
  } catch (e) {
    if (e instanceof FormError) return { error: e.message }
    throw e
  }
}
