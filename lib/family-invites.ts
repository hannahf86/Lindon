// =============================================================================
// lib/family-invites.ts — the teacher inviting families into Lindon
//
// A teacher can give a family login to:
//   • a parent / guardian  → they'll see their linked under-18 children
//   • an adult pupil (18+) → they'll see themselves
// Children never get their own login (safeguarding) — invite their parents.
//
// Access lives in family_access, tied to an email address. There's at most
// one live (un-revoked) row per person; removing access sets revoked_at and
// keeps the row as an audit trail. Every query here is scoped by teacher.
// =============================================================================
import 'server-only'
import { db } from './db'
import { fullName, isMinor } from './format'
import { fmtTz } from './dates'
import { sendEmail, studioName } from './email'
import { familyInviteEmail } from './email-templates'
import { appUrl, type ConversationTarget } from './messages'
import { FormError } from './forms'
import type { FamilyAccess, Teacher } from './database.types'

export type FamilyTarget = ConversationTarget

// ---- Status --------------------------------------------------------------------------
export type AccessState = 'none' | 'invited' | 'active' | 'removed'

export type AccessStatus = {
  state: AccessState
  /** The live invitation, if there is one */
  live: FamilyAccess | null
  /** Most recent invitation of any kind (live or removed) */
  latest: FamilyAccess | null
}

/** Work out someone's access from all their family_access rows. */
export function accessStatus(rows: FamilyAccess[]): AccessStatus {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const live = sorted.find((r) => !r.revoked_at) ?? null
  const latest = sorted[0] ?? null
  if (live) return { state: live.last_seen_at ? 'active' : 'invited', live, latest }
  return { state: latest ? 'removed' : 'none', live: null, latest }
}

/** One-line description for the teacher, e.g. "Invited 3 Oct". */
export function accessText(s: AccessStatus, timeZone: string, hasEmail: boolean): string {
  switch (s.state) {
    case 'active':
      return `Last signed in ${fmtTz(s.live!.last_seen_at!, timeZone, 'd MMM')}`
    case 'invited':
      return `Invited ${fmtTz(s.live!.invited_at, timeZone, 'd MMM')} — hasn’t signed in yet`
    case 'removed':
      return `Access removed ${fmtTz(s.latest!.revoked_at!, timeZone, 'd MMM')}`
    default:
      return hasEmail ? 'Hasn’t been invited — they’ll get your messages by email' : 'Hasn’t been invited, and has no email address'
  }
}

/** All family_access rows for one person (this teacher only). */
export async function accessRows(teacherId: string, target: FamilyTarget): Promise<FamilyAccess[]> {
  const q = db().from('family_access').select('*').eq('teacher_id', teacherId)
  const { data, error } = await ('guardianId' in target ? q.eq('guardian_id', target.guardianId) : q.eq('student_id', target.studentId))
  if (error) throw new Error(error.message)
  return data ?? []
}

// ---- Who are we inviting? ------------------------------------------------------------
type Invitee = { name: string; firstName: string; email: string; pupilNames: string[] }

/** Load the person (scoped by teacher) and check they're allowed a login. */
async function loadInvitee(teacherId: string, target: FamilyTarget): Promise<Invitee> {
  if ('guardianId' in target) {
    const { data: g } = await db()
      .from('guardians')
      .select('first_name, last_name, email, student_guardians(students(first_name, date_of_birth, is_minor, status))')
      .eq('id', target.guardianId)
      .eq('teacher_id', teacherId)
      .maybeSingle()
    if (!g) throw new FormError('That contact no longer exists.')
    // They'll only see children who are under 18 and still having lessons
    const pupilNames = g.student_guardians
      .map((l) => l.students)
      .filter((s): s is NonNullable<typeof s> => !!s && isMinor(s) && s.status !== 'left')
      .map((s) => s.first_name)
    return { name: fullName(g), firstName: g.first_name, email: g.email.trim().toLowerCase(), pupilNames }
  }
  const { data: s } = await db()
    .from('students')
    .select('first_name, last_name, email, date_of_birth, is_minor')
    .eq('id', target.studentId)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (!s) throw new FormError('That pupil no longer exists.')
  if (isMinor(s)) throw new FormError('Children don’t get their own login — invite their parents from the contact page.')
  return { name: fullName(s), firstName: s.first_name, email: s.email.trim().toLowerCase(), pupilNames: [] }
}

/** Email the invitation (logged in email_log). Returns an error message if it didn't go. */
async function sendInvite(teacher: Teacher, to: string, invitee: Invitee): Promise<string | undefined> {
  const teacherName = teacher.display_name || studioName(teacher)
  const result = await sendEmail({
    teacher,
    to: [to],
    kind: 'family_invite',
    email: familyInviteEmail({
      studio: studioName(teacher),
      teacherName,
      inviteeName: invitee.firstName,
      pupilNames: invitee.pupilNames,
      url: appUrl('/login'),
    }),
  })
  return result.sent > 0 ? undefined : (result.error ?? 'The email could not be sent.')
}

const notSentNote = (to: string, err: string) =>
  `Access is set up for ${to}, but the invitation email didn’t send (${err}). Refresh the page and try “Resend invite”, or tell them to sign in at ${appUrl('/login')}.`

// ---- Invite -------------------------------------------------------------------------------
/** Give someone a family login and email them. Throws FormError for the teacher to read. */
export async function inviteFamily(teacher: Teacher, target: FamilyTarget): Promise<string> {
  const invitee = await loadInvitee(teacher.id, target)
  if (!/^\S+@\S+\.\S+$/.test(invitee.email)) throw new FormError(`Add an email address for ${invitee.name} first — that’s what they sign in with.`)

  const status = accessStatus(await accessRows(teacher.id, target))
  if (status.live) throw new FormError(`${invitee.name} is already invited. Use “Resend invite” to send the email again.`)

  const { error } = await db()
    .from('family_access')
    .insert({
      teacher_id: teacher.id,
      email: invitee.email,
      guardian_id: 'guardianId' in target ? target.guardianId : null,
      student_id: 'studentId' in target ? target.studentId : null,
    })
  if (error) {
    if (/duplicate key/.test(error.message)) throw new FormError(`${invitee.name} is already invited.`)
    throw new Error(error.message)
  }

  const err = await sendInvite(teacher, invitee.email, invitee)
  if (err) throw new FormError(notSentNote(invitee.email, err))
  return `Invitation sent to ${invitee.email}.`
}

// ---- Resend ---------------------------------------------------------------------------------
/** Send the invitation email again (to the address on the live invite). */
export async function resendFamilyInvite(teacher: Teacher, target: FamilyTarget): Promise<string> {
  const invitee = await loadInvitee(teacher.id, target)
  const { live } = accessStatus(await accessRows(teacher.id, target))
  if (!live) throw new FormError(`${invitee.name} doesn’t have an invitation to resend.`)

  await db().from('family_access').update({ invited_at: new Date().toISOString() }).eq('id', live.id).eq('teacher_id', teacher.id)
  const err = await sendInvite(teacher, live.email, invitee)
  if (err) throw new FormError(notSentNote(live.email, err))
  return `Invitation sent again to ${live.email}.`
}

// ---- Remove access ----------------------------------------------------------------------------
/** Revoke the live invitation. Messages and history are kept. */
export async function removeFamilyAccess(teacher: Teacher, target: FamilyTarget): Promise<string> {
  const q = db().from('family_access').update({ revoked_at: new Date().toISOString() }).eq('teacher_id', teacher.id).is('revoked_at', null)
  const { error } = await ('guardianId' in target ? q.eq('guardian_id', target.guardianId) : q.eq('student_id', target.studentId))
  if (error) throw new Error(error.message)
  return 'Access removed. They can no longer sign in to see this.'
}

// ---- Re-invite with a new email -----------------------------------------------------------------
/** Their email changed since the invite: revoke the old one and invite the new address. */
export async function reinviteFamily(teacher: Teacher, target: FamilyTarget): Promise<string> {
  // Validate first, so we don't remove access and then fail to re-invite
  const invitee = await loadInvitee(teacher.id, target)
  if (!/^\S+@\S+\.\S+$/.test(invitee.email)) throw new FormError(`Add an email address for ${invitee.name} first.`)
  await removeFamilyAccess(teacher, target)
  return inviteFamily(teacher, target)
}
