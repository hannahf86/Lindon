'use server'
// =============================================================================
// contacts/family-actions.ts — invite a parent / adult pupil into Lindon,
// resend the invite, remove their access, or re-invite at a new address.
// Used by the family access card on both contact and student pages.
// The work (and the teacher scoping) lives in lib/family-invites.ts.
// =============================================================================
import { revalidatePath } from 'next/cache'
import { requireTeacher } from '@/lib/db'
import { handle, FormError, type ActionState } from '@/lib/forms'
import { inviteFamily, reinviteFamily, removeFamilyAccess, resendFamilyInvite, type FamilyTarget } from '@/lib/family-invites'
import type { Teacher } from '@/lib/database.types'

export type FamilyKind = 'guardian' | 'student'

/** Turn the bound (kind, id) into a target — never trusted until lib scopes it by teacher. */
function target(kind: FamilyKind, id: string): FamilyTarget {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FormError('Invalid reference.')
  if (kind === 'guardian') return { guardianId: id }
  if (kind === 'student') return { studentId: id }
  throw new FormError('Invalid reference.')
}

/** Shared wrapper: run, then refresh every page that shows access status. */
function run(kind: FamilyKind, id: string, fn: (teacher: Teacher, t: FamilyTarget) => Promise<string>): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const t = target(kind, id)
    const ok = await fn(teacher, t)
    // Only refresh on success: on an error the button (and its message) must
    // stay on screen so the teacher can read what went wrong
    revalidatePath(kind === 'guardian' ? `/contacts/${id}` : `/students/${id}`)
    // Parents can also be invited from their child's page
    if (kind === 'guardian') revalidatePath('/students', 'layout')
    revalidatePath('/messages', 'layout')
    return { ok }
  })
}

// ---- Invite ---------------------------------------------------------------------------
export async function inviteFamilyAction(kind: FamilyKind, id: string): Promise<ActionState> {
  return run(kind, id, inviteFamily)
}

// ---- Resend invite ---------------------------------------------------------------------
export async function resendInviteAction(kind: FamilyKind, id: string): Promise<ActionState> {
  return run(kind, id, resendFamilyInvite)
}

// ---- Remove access ------------------------------------------------------------------------
export async function removeAccessAction(kind: FamilyKind, id: string): Promise<ActionState> {
  return run(kind, id, removeFamilyAccess)
}

// ---- Re-invite with new email -----------------------------------------------------------------
export async function reinviteAction(kind: FamilyKind, id: string): Promise<ActionState> {
  return run(kind, id, reinviteFamily)
}
