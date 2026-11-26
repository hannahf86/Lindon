// =============================================================================
// lib/announcements.ts — message every family at once (Messages → Announcement)
//
// Who gets it: every ACTIVE pupil's family —
//   · under-18s → each linked parent / guardian (once, even with siblings)
//   · adult pupils → the pupil themselves
// Each gets the announcement as a normal message in their own conversation
// (so they can reply privately), plus the usual email alert. Children are
// never messaged directly (safeguarding).
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { isMinor } from './format'
import type { ConversationTarget } from './messages'

export async function announcementTargets(teacherId: string): Promise<ConversationTarget[]> {
  const students = must(
    await db()
      .from('students')
      .select('id, date_of_birth, is_minor, student_guardians(guardian_id)')
      .eq('teacher_id', teacherId)
      .eq('status', 'active'),
  )
  const guardians = new Set<string>()
  const adults: string[] = []
  for (const s of students) {
    if (isMinor(s)) for (const l of s.student_guardians) guardians.add(l.guardian_id)
    else adults.push(s.id)
  }
  return [...[...guardians].map((guardianId) => ({ guardianId })), ...adults.map((studentId) => ({ studentId }))]
}
