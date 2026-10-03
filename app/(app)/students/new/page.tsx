// =============================================================================
// students/new/page.tsx — add a student
// =============================================================================
import type { Metadata } from 'next'
import { requireTeacher } from '@/lib/db'
import { instrumentSuggestions } from '@/lib/queries'
import { PageHeader } from '@/components/ui'
import { StudentForm } from '../student-form'
import { createStudent } from '../actions'

export const metadata: Metadata = { title: 'Add student' }

export default async function NewStudentPage() {
  const teacher = await requireTeacher()
  return (
    <>
      <PageHeader title="Add a student" back={{ href: '/students', label: 'Students' }} />
      <StudentForm action={createStudent} instrumentSuggestions={await instrumentSuggestions(teacher.id)} cancelHref="/students" />
    </>
  )
}
