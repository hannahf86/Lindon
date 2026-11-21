'use server'
// =============================================================================
// account/actions.ts — set, change or remove the signed-in person's password
// (always their own: the user id comes from the session, never the form).
// =============================================================================
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { handle, FormError, type ActionState } from '@/lib/forms'
import { MIN_PASSWORD_LENGTH, removePassword, setPassword } from '@/lib/passwords'

async function currentUserId(): Promise<string> {
  const session = await auth()
  const id = session?.user?.id
  if (!id) throw new FormError('You’ve been signed out — sign in again first.')
  return id
}

export async function savePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const userId = await currentUserId()
    // Exactly as typed — spaces count in a password
    const password = String(fd.get('password') ?? '')
    if (password.length < MIN_PASSWORD_LENGTH) throw new FormError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password.length > 200) throw new FormError('That password is too long.')
    if (password !== String(fd.get('confirm') ?? '')) throw new FormError('The two passwords don’t match.')
    await setPassword(userId, password)
    revalidatePath('/account')
    return { ok: 'Password saved. Next time, sign in with your email and this password.' }
  })
}

export async function removePasswordAction(): Promise<ActionState> {
  return handle(async () => {
    await removePassword(await currentUserId())
    revalidatePath('/account')
    return { ok: 'Password removed.' }
  })
}
