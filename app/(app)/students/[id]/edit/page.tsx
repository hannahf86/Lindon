// =============================================================================
// students/[id]/edit/page.tsx — edit a student
// =============================================================================
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db, requireTeacher } from '@/lib/db'
import { fullName } from '@/lib/format'
import { instrumentSuggestions } from '@/lib/queries'
import { PageHeader } from '@/components/ui'
import { StudentForm } from '../../student-form'
import { updateStudent } from '../../actions'

export const metadata: Metadata = { title: 'Edit student' }

export default async function EditStudentPage({ params }: PageProps<'/students/[id]/edit'>) {
  const { id } = await params
  const teacher = await requireTeacher()
  const { data: student } = await db().from('students').select('*').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
  if (!student) notFound()

  return (
    <>
      <PageHeader title={`Edit ${fullName(student)}`} back={{ href: `/students/${id}`, label: fullName(student) }} />
      <StudentForm
        action={updateStudent.bind(null, id)}
        student={student}
        instrumentSuggestions={await instrumentSuggestions(teacher.id)}
        cancelHref={`/students/${id}`}
      />
    </>
  )
}
