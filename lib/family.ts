// =============================================================================
// lib/family.ts — "who is this family member, and what may they see?"
//
// requireFamily() is the ONLY way family pages get data access. It returns
// the signed-in person's live invitations, and for each one the exact set of
// pupils they may see:
//   • a parent / guardian → their linked children who are still under 18
//     (and haven't left). Once a child turns 18 the parent loses access.
//   • an adult pupil      → themselves only (while they're 18+).
// Every family query must filter by link.teacherId AND link.studentIds.
// Teachers' private notes (students.notes, guardians.notes) are never shown.
// =============================================================================
import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { db } from './admin'
import { fullName, isMinor } from './format'
import type { Teacher } from './database.types'

export type FamilyTeacher = Pick<Teacher, 'id' | 'display_name' | 'business_name' | 'email' | 'phone' | 'currency' | 'timezone' | 'payment_details'>

export type FamilyPupil = { id: string; first_name: string; last_name: string; instruments: string[] }

export type FamilyLink = {
  accessId: string
  teacher: FamilyTeacher
  /** Whose invitation this is */
  kind: 'guardian' | 'student'
  guardianId: string | null
  studentId: string | null
  /** The signed-in person's name as the teacher has it */
  contactName: string
  /** Pupils this person may see under this teacher */
  pupils: FamilyPupil[]
  studentIds: string[]
}

export type FamilyContext = { email: string; name: string; links: FamilyLink[] }

/** The signed-in family member's access. Redirects away if they have none. Cached per request. */
export const requireFamily = cache(async (): Promise<FamilyContext> => {
  const session = await auth()
  const email = (session?.user?.email ?? '').toLowerCase()
  if (!email) redirect('/login')

  const { data, error } = await db()
    .from('family_access')
    .select(
      `id, teacher_id, guardian_id, student_id,
       teachers(id, display_name, business_name, email, phone, currency, timezone, payment_details),
       guardians(first_name, last_name, student_guardians(students(id, first_name, last_name, instruments, date_of_birth, is_minor, status))),
       students(id, first_name, last_name, instruments, date_of_birth, is_minor, status)`,
    )
    .eq('email', email)
    .is('revoked_at', null)
  if (error) throw new Error(error.message)

  const links: FamilyLink[] = []
  for (const row of data ?? []) {
    const teacher = (row as unknown as { teachers: FamilyTeacher | null }).teachers
    if (!teacher) continue
    let pupils: (FamilyPupil & { date_of_birth: string | null; is_minor: boolean; status: string })[] = []
    let contactName = ''
    if (row.guardian_id && row.guardians) {
      contactName = fullName(row.guardians)
      pupils = row.guardians.student_guardians
        .map((l) => l.students)
        .filter((s): s is NonNullable<typeof s> => !!s && isMinor(s) && s.status !== 'left')
    } else if (row.student_id && row.students) {
      contactName = fullName(row.students)
      pupils = !isMinor(row.students) && row.students.status !== 'left' ? [row.students] : []
    }
    const clean = pupils.map(({ id, first_name, last_name, instruments }) => ({ id, first_name, last_name, instruments }))
    links.push({
      accessId: row.id,
      teacher,
      kind: row.guardian_id ? 'guardian' : 'student',
      guardianId: row.guardian_id,
      studentId: row.student_id,
      contactName,
      pupils: clean,
      studentIds: clean.map((p) => p.id),
    })
  }

  if (links.length === 0) redirect('/')

  // Record when they were last here (shown to the teacher on the invite card)
  await db().from('family_access').update({ last_seen_at: new Date().toISOString() }).in('id', links.map((l) => l.accessId))

  return { email, name: links[0].contactName, links }
})

/** The link (invitation) that gives access to this teacher, or null. */
export function linkForTeacher(ctx: FamilyContext, teacherId: string): FamilyLink | null {
  return ctx.links.find((l) => l.teacher.id === teacherId) ?? null
}

/** Is this pupil visible to the signed-in family member under this teacher? */
export function canSeePupil(ctx: FamilyContext, teacherId: string, studentId: string): boolean {
  return !!linkForTeacher(ctx, teacherId)?.studentIds.includes(studentId)
}

/** All (teacherId, studentId) pairs visible — handy for "everything upcoming" queries. */
export function visiblePupils(ctx: FamilyContext): { teacherId: string; studentId: string }[] {
  return ctx.links.flatMap((l) => l.studentIds.map((studentId) => ({ teacherId: l.teacher.id, studentId })))
}

/** Teacher's display name for family-facing pages. */
export function teacherName(t: FamilyTeacher): string {
  return t.display_name || t.business_name || 'Your teacher'
}
