// =============================================================================
// lib/db.ts — server-only Supabase access + "who is the signed-in teacher?"
// (The raw client lives in lib/admin.ts so auth.ts can use it without a cycle.)
//
// The service-role client bypasses RLS, so it must never reach the browser
// (`server-only` makes the build fail if a client component imports this).
// EVERY query must be scoped with .eq('teacher_id', teacher.id) — and every
// insert must set teacher_id from requireTeacher(), never from form data.
// =============================================================================
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from './admin'
import { canBeTeacher, hasFamilyAccess } from './access'
import type { Teacher } from './database.types'

export { db, type Db } from './admin'

/**
 * The signed-in teacher's profile. Redirects to /login when signed out and
 * creates the teacher row on first visit. Cached per request.
 */
export const requireTeacher = cache(async (): Promise<Teacher> => {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/login')

  const { data, error } = await db().from('teachers').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  if (data) return data

  // Not a teacher yet. Family members (invited parents / adult pupils) go to
  // their own area — they must never be turned into teacher accounts.
  const email = session.user?.email ?? ''
  if (await hasFamilyAccess(email)) redirect('/family')
  if (!canBeTeacher(email)) redirect('/login?error=AccessDenied')

  // First sign-in as a teacher: create the studio profile
  const { data: created, error: insertError } = await db()
    .from('teachers')
    .insert({ id: userId, email, display_name: session.user?.name ?? '' })
    .select('*')
    .single()
  if (insertError) throw insertError
  return created
})

/**
 * Unwrap a Supabase result: throws on error, returns the data.
 * Use for list queries and .single(). For .maybeSingle() read `.data`
 * yourself, because "no row" is a valid answer there.
 */
export function must<R extends { data: unknown; error: { message: string } | null }>(result: R): NonNullable<R['data']> {
  if (result.error) throw new Error(result.error.message)
  if (result.data === null) throw new Error('Not found')
  return result.data as NonNullable<R['data']>
}
