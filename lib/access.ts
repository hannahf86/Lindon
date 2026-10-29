// =============================================================================
// lib/access.ts — who may sign in, and as what
//
// Teachers: anyone, unless AUTH_ALLOWED_EMAILS is set — then only those, plus
//           anyone whose access request an admin has approved.
// Families: anyone a teacher has invited (a live family_access row), whether
//           or not they're on the teacher allowlist.
// Admins:   AUTH_ADMIN_EMAILS (falls back to AUTH_ALLOWED_EMAILS) — they see
//           Settings → Access requests and approve new teachers.
// =============================================================================
import 'server-only'
import { db } from './admin'

const allowed = (process.env.AUTH_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

const admins = (process.env.AUTH_ADMIN_EMAILS ?? process.env.AUTH_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

/** Is sign-up open to anyone (no allowlist configured)? */
export const openSignup = allowed.length === 0

/** May this email have a teacher account? (allowlist, or an approved request) */
export async function canBeTeacher(email: string | null | undefined): Promise<boolean> {
  const e = (email ?? '').trim().toLowerCase()
  if (openSignup) return true
  if (allowed.includes(e)) return true
  if (!e) return false
  const { count } = await db().from('access_requests').select('id', { count: 'exact', head: true }).eq('email', e).eq('status', 'approved')
  return (count ?? 0) > 0
}

/** Can this person approve access requests? */
export function isAdmin(email: string | null | undefined): boolean {
  return admins.includes((email ?? '').trim().toLowerCase())
}

/** Admin addresses (for "new request" notification emails). */
export function adminEmails(): string[] {
  return admins
}

/** Has any teacher invited this email (and not revoked it)? */
export async function hasFamilyAccess(email: string | null | undefined): Promise<boolean> {
  const e = (email ?? '').trim().toLowerCase()
  if (!e) return false
  const { count } = await db().from('family_access').select('id', { count: 'exact', head: true }).eq('email', e).is('revoked_at', null)
  return (count ?? 0) > 0
}

/** Is this email an existing teacher? (So a teacher always keeps access.) */
export async function isExistingTeacher(email: string | null | undefined): Promise<boolean> {
  const e = (email ?? '').trim().toLowerCase()
  if (!e) return false
  const { count } = await db().from('teachers').select('id', { count: 'exact', head: true }).ilike('email', e)
  return (count ?? 0) > 0
}
