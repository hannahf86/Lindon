// =============================================================================
// lib/access.ts — who may sign in, and as what
//
// Teachers: anyone, unless AUTH_ALLOWED_EMAILS is set (then only those).
// Families: anyone a teacher has invited (a live family_access row), whether
//           or not they're on the teacher allowlist.
// =============================================================================
import 'server-only'
import { db } from './admin'

const allowed = (process.env.AUTH_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

/** May this email have a teacher account? */
export function canBeTeacher(email: string | null | undefined): boolean {
  if (allowed.length === 0) return true
  return allowed.includes((email ?? '').toLowerCase())
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
