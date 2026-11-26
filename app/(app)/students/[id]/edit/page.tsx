// =============================================================================
// students/[id]/edit/page.tsx — edit a student (and, for children, their
// parents or guardians on the same page)
// =============================================================================
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db, requireTeacher } from '@/lib/db'
import { fullName } from '@/lib/format'
import { instrumentSuggestions } from '@/lib/queries'
import { todayISO } from '@/lib/dates'
import { bookingSummary, currencySymbol } from '@/lib/lessons'
import { dayName, hhmm } from '@/lib/format'
import { PageHeader } from '@/components/ui'
import { StudentForm, type ParentRow } from '../../student-form'
import { updateStudent } from '../../actions'

export const metadata: Metadata = { title: 'Edit student' }

export default async function EditStudentPage({ params }: PageProps<'/students/[id]/edit'>) {
  const { id } = await params
  const teacher = await requireTeacher()
  const { data: student } = await db().from('students').select('*').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
  if (!student) notFound()
  const { data: links } = await db()
    .from('student_guardians')
    .select('guardian_id, relationship, is_primary, guardians(first_name, last_name, email, phone)')
    .eq('teacher_id', teacher.id)
    .eq('student_id', id)
  // Their regular lessons (bookings that haven't ended)
  const { data: slots } = await db()
    .from('time_slots')
    .select('*')
    .eq('teacher_id', teacher.id)
    .eq('student_id', id)
    .order('day_of_week')
  const today = todayISO(teacher.timezone)
  const bookings = (slots ?? [])
    .filter((b) => !b.ends_on || b.ends_on >= today)
    .map((b) => ({ id: b.id, summary: `${dayName(b.day_of_week)}s at ${hhmm(b.start_time)} · ${b.duration_minutes} minutes · ${bookingSummary(b)}` }))
  // Main contact first
  const parents: ParentRow[] = (links ?? [])
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .filter((l) => l.guardians)
    .map((l) => ({ guardian_id: l.guardian_id, relationship: l.relationship, ...l.guardians! }))

  return (
    <>
      <PageHeader title={`Edit ${fullName(student)}`} back={{ href: `/students/${id}`, label: fullName(student) }} />
      <StudentForm
        action={updateStudent.bind(null, id)}
        student={student}
        instrumentSuggestions={await instrumentSuggestions(teacher.id)}
        cancelHref={`/students/${id}`}
        parents={parents}
        lesson={{ currencySymbol: currencySymbol(teacher.currency), today, locations: teacher.locations ?? [] }}
        bookings={bookings}
      />
    </>
  )
}
