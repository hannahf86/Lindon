'use server'
// =============================================================================
// join/[token]/actions.ts — finish the family welcome page
//
// Checks the link is still live, saves the person's name and phone, creates
// their sign-in (Auth.js user + password), marks the invitation as onboarded,
// then signs them in with that password and opens /family.
// The token in the emailed link is the proof they own the email address.
// =============================================================================
import { revalidatePath } from 'next/cache'
import { signIn } from '@/auth'
import { db, must } from '@/lib/db'
import { bool, handle, required, str, FormError, type ActionState } from '@/lib/forms'
import { loadInvite } from '@/lib/family-join'
import { ensureAuthUser, MIN_PASSWORD_LENGTH, setPassword } from '@/lib/passwords'

export async function completeJoin(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let email = ''
  const password = String(fd.get('password') ?? '') // exact, never trimmed
  const result = await handle(async () => {
    const invite = await loadInvite(token)
    if (!invite) throw new FormError('This invitation link isn’t working any more. Ask your teacher to send it again.')
    if (invite.onboarded) throw new FormError('This account is already set up — sign in instead.')
    if (invite.pupils.some((p) => p.lessons.length) && !bool(fd, 'confirm')) throw new FormError('Tick “These details look right” — or let your teacher know what needs changing.')
    if (password.length < MIN_PASSWORD_LENGTH) throw new FormError(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password !== String(fd.get('password_again') ?? '')) throw new FormError('The two passwords don’t match.')

    // ---- Their details ----
    const details = { first_name: required(fd, 'first_name', 'First name'), last_name: str(fd, 'last_name'), phone: str(fd, 'phone') }
    const table = invite.kind === 'guardian' ? 'guardians' : 'students'
    must(await db().from(table).update(details).eq('id', invite.person.id).eq('teacher_id', invite.teacher.id).select('id'))

    // ---- Their sign-in ----
    const userId = await ensureAuthUser(invite.email, `${details.first_name} ${details.last_name}`.trim())
    await setPassword(userId, password)
    must(await db().from('family_access').update({ onboarded_at: new Date().toISOString(), last_seen_at: new Date().toISOString() }).eq('id', invite.accessId).select('id'))
    email = invite.email
  })
  if (result?.error) return result

  revalidatePath('/family', 'layout')
  // Throws Next's redirect to /family once signed in
  await signIn('credentials', { email, password, redirectTo: '/family' })
  return null
}
