'use server'
// =============================================================================
// signup/actions.ts — "Request an account"
//
// While Lindon is invite-only: saves the request and emails the admin(s).
// If the email can already have a teacher account (approved before, on the
// allowlist, or sign-up is open), it sends them a sign-in link instead.
// =============================================================================
import { signIn } from '@/auth'
import { db } from '@/lib/admin'
import { adminEmails, canBeTeacher } from '@/lib/access'
import { FormError, handle, required, str, type ActionState } from '@/lib/forms'
import { accessRequestedEmail } from '@/lib/email-templates'
import { appUrl } from '@/lib/messages'
import { sendSystemEmail } from '@/lib/system-email'

export async function requestAccess(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, 'email').toLowerCase()
  // Already allowed in? Skip the queue and send their sign-in link
  // (signIn redirects to "check your email", so it runs outside handle()).
  if (/^\S+@\S+\.\S+$/.test(email) && (await canBeTeacher(email))) {
    await signIn('resend', { email, redirectTo: '/' })
  }
  return handle(async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new FormError('Please enter a valid email address.')
    const name = required(fd, 'name', 'Your name')
    const studio = str(fd, 'studio')
    const teaches = str(fd, 'teaches')

    const { data: existing } = await db().from('access_requests').select('status').eq('email', email).maybeSingle()
    if (existing?.status === 'pending') return { ok: "Thanks — you've already asked. We'll email you as soon as your account is approved." }

    const { error } = existing
      ? await db().from('access_requests').update({ name, studio, teaches, status: 'pending', decided_at: null, decided_by: null }).eq('email', email)
      : await db().from('access_requests').insert({ email, name, studio, teaches })
    if (error) throw new Error(error.message)

    const admins = adminEmails()
    if (admins.length) await sendSystemEmail(admins, accessRequestedEmail({ name, email, studio, teaches, url: appUrl('/settings/access') }))
    return { ok: "Thanks! Your request is in. We'll email you at " + email + ' as soon as your account is ready.' }
  })
}
