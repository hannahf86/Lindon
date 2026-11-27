'use server'
// =============================================================================
// (site)/contact/actions.ts — send a suggestion, bug report or question
//
// Anyone can use it (signed in or not). Saved to the feedback table and
// emailed to CONTACT_EMAIL (the Lindon mailbox) — or the admins if that isn't
// set — with "reply" going straight to the sender.
// Light spam protection: a hidden "website" field that people never fill in
// (bots do), and a minimum few seconds between opening the page and sending.
// =============================================================================
import { auth } from '@/auth'
import { db } from '@/lib/admin'
import { adminEmails } from '@/lib/access'
import { FormError, handle, str, type ActionState } from '@/lib/forms'
import { feedbackEmail } from '@/lib/email-templates'
import { appUrl } from '@/lib/messages'
import { sendSystemEmail } from '@/lib/system-email'
import { contactInbox } from '@/lib/site'

const KINDS = ['suggestion', 'bug', 'question', 'other'] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function sendFeedback(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    // Bots: the hidden field is filled, or the form came back impossibly fast
    const openedAt = Number(str(fd, 'opened_at'))
    if (str(fd, 'website') || (openedAt && Date.now() - openedAt < 3000)) return { ok: 'Thanks — your message has been sent.' }

    const kind = KINDS.find((k) => k === str(fd, 'kind')) ?? 'other'
    const name = str(fd, 'name').slice(0, 120)
    const email = str(fd, 'email').toLowerCase().slice(0, 320)
    const message = str(fd, 'message')
    if (!message) throw new FormError('Please write your message.')
    if (message.length > 5000) throw new FormError('That’s a bit long — please keep it under 5,000 characters.')
    if (!email || !EMAIL_RE.test(email)) throw new FormError('Please add your email address so we can reply.')

    const session = await auth()
    const signedInAs = session?.user?.email ?? ''
    const page = str(fd, 'page').slice(0, 300)
    const userAgent = str(fd, 'user_agent').slice(0, 300)

    const { error } = await db().from('feedback').insert({ kind, name, email, message, signed_in_as: signedInAs, page, user_agent: userAgent })
    if (error) throw new FormError('Sorry — your message couldn’t be sent just now. Please try again in a minute.')

    const inbox = contactInbox()
    const to = inbox ? [inbox] : adminEmails()
    if (to.length) await sendSystemEmail(to, feedbackEmail({ kind, name, email, message, signedInAs, page, url: appUrl('/admin/feedback') }), email)

    return {
      ok:
        kind === 'bug'
          ? 'Thanks for letting us know — we’ll look into it and reply by email if we need more details.'
          : 'Thanks — your message has been sent. We’ll reply by email.',
    }
  })
}
