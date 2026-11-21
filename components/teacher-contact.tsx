// =============================================================================
// components/teacher-contact.tsx — "contact your teacher" note for families
//
// Only the teacher can move a lesson, so families get the teacher's email and
// phone rather than a reschedule button. Used on the family home and Lessons.
// =============================================================================
import type { FamilyTeacher } from '@/lib/family'

export function TeacherContact({ teacher, label }: { teacher: FamilyTeacher; label: string }) {
  if (!teacher.email && !teacher.phone) return <p className="small muted" style={{ margin: 0 }}>{label} Please contact your teacher.</p>
  return (
    <p className="small" style={{ margin: 0 }}>
      {label} Contact your teacher
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
      .
    </p>
  )
}
