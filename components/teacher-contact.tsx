// =============================================================================
// components/teacher-contact.tsx — "need to change a lesson?" note for families
//
// Points families to Reschedule / Cancel on their Lessons page, and to a
// message in the app (Hannah's call: not the teacher's email address).
// Only if the teacher has in-app messages switched off does it fall back to
// their email / phone, so there's always a way to get in touch.
// Used on the family home.
// =============================================================================
import Link from 'next/link'
import type { FamilyTeacher } from '@/lib/family'
import { has } from '@/lib/features'

export function TeacherContact({ teacher, label }: { teacher: FamilyTeacher; label: string }) {
  // ---- In-app messages on: lessons page + a message, no email shown ----
  if (has(teacher, 'messaging')) {
    return (
      <p className="small" style={{ margin: 0 }}>
        {label} Use Reschedule or Cancel on your <Link href="/family/lessons">Lessons</Link> page, or <Link href="/family/messages">send a message in the app</Link>.
      </p>
    )
  }

  // ---- Messages off: Lessons page, then email / phone ----
  return (
    <p className="small" style={{ margin: 0 }}>
      {label} Use Reschedule or Cancel on your <Link href="/family/lessons">Lessons</Link> page
      {teacher.email || teacher.phone ? ', or contact your teacher' : '.'}
      {teacher.email && (
        <>
          {' '}
          at <a href={`mailto:${teacher.email}`}>{teacher.email}</a>
        </>
      )}
      {teacher.phone && (
        <>
          {' '}
          {teacher.email ? 'or' : 'on'} <a href={`tel:${teacher.phone.replace(/\s/g, '')}`}>{teacher.phone}</a>
        </>
      )}
      {(teacher.email || teacher.phone) && '.'}
    </p>
  )
}
