'use server'
// =============================================================================
// settings/access/actions.ts — approve or decline a teacher's access request
// Admins only (lib/access.ts → isAdmin). Approving emails them a sign-in link.
// =============================================================================
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { db } from '@/lib/admin'
import { isAdmin } from '@/lib/access'
import { FormError, handle, type ActionState } from '@/lib/forms'
import { accessApprovedEmail } from '@/lib/email-templates'
import { appUrl } from '@/lib/messages'
import { sendSystemEmail } from '@/lib/system-email'

async function requireAdmin(): Promise<string> {
  const session = await auth()
  const email = session?.user?.email ?? ''
  if (!isAdmin(email)) throw new FormError('Only Lindon admins can do that.')
  return email
}

export async function decideRequest(id: string, decision: 'approved' | 'declined'): Promise<ActionState> {
  return handle(async () => {
    const admin = await requireAdmin()
    const { data: req, error } = await db()
      .from('access_requests')
      .update({ status: decision, decided_at: new Date().toISOString(), decided_by: admin })
      .eq('id', id)
      .select('email, name')
      .single()
    if (error || !req) throw new FormError('That request no longer exists.')
    revalidatePath('/settings/access')
    revalidatePath('/settings')
    if (decision === 'declined') return { ok: `Declined ${req.email}.` }
    const err = await sendSystemEmail([req.email], accessApprovedEmail({ name: req.name, url: appUrl('/login') }))
    return err
      ? { ok: `Approved ${req.email}, but the email didn't send (${err}). Tell them to sign in at ${appUrl('/login')}.` }
      : { ok: `Approved — ${req.email} has been emailed a link to sign in.` }
  })
}
