// =============================================================================
// lib/recipients.ts — "who do I email about this student?"
//
// Rule: under-18s are contacted through their linked guardians (those with
// receives_emails on). Students 18+ are emailed directly. A student whose
// age is unknown follows the teacher's under-18 / 18+ choice (see isMinor).
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { fullName, isMinor } from './format'

export type Recipient = {
  studentId: string
  studentName: string
  name: string // the person receiving the email
  email: string
  via: 'student' | 'guardian'
}

/**
 * Contacts for the given students (or every active student when ids is
 * omitted). Students with no usable email are returned in `missing`.
 */
export async function recipientsFor(
  teacherId: string,
  ids?: string[],
): Promise<{ recipients: Recipient[]; missing: { id: string; name: string }[] }> {
  let q = db()
    .from('students')
    .select('id, first_name, last_name, email, date_of_birth, is_minor, status, student_guardians(receives_emails, guardians(first_name, last_name, email))')
    .eq('teacher_id', teacherId)
  q = ids ? q.in('id', ids) : q.eq('status', 'active')
  const students = must(await q)

  const recipients: Recipient[] = []
  const missing: { id: string; name: string }[] = []
  for (const s of students) {
    const studentName = fullName(s)
    const before = recipients.length
    if (isMinor(s)) {
      for (const link of s.student_guardians ?? []) {
        const g = link.guardians
        if (link.receives_emails && g?.email) {
          recipients.push({ studentId: s.id, studentName, name: fullName(g), email: g.email, via: 'guardian' })
        }
      }
    } else if (s.email) {
      recipients.push({ studentId: s.id, studentName, name: studentName, email: s.email, via: 'student' })
    }
    if (recipients.length === before) missing.push({ id: s.id, name: studentName })
  }
  return { recipients, missing }
}
