// =============================================================================
// exams/new/page.tsx — add an exam (?student=<id> preselects the student)
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireTeacher } from '@/lib/db'
import { studentOptions } from '@/lib/queries'
import { EmptyState, PageHeader } from '@/components/ui'
import { ExamForm } from '../exam-form'
import { createExam } from '../actions'
import { examSuggestions } from '../helpers'
import { currencySymbol } from '../../library/helpers'

export const metadata: Metadata = { title: 'Add exam' }

export default async function NewExamPage({ searchParams }: PageProps<'/exams/new'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const [students, suggestions] = await Promise.all([studentOptions(teacher.id), examSuggestions(teacher.id)])
  const preselect = typeof sp.student === 'string' && students.some((s) => s.id === sp.student) ? sp.student : undefined
  const back = preselect ? { href: `/students/${preselect}`, label: 'Back to student' } : { href: '/exams', label: 'Exams' }

  return (
    <>
      <PageHeader title="Add an exam" back={back} />
      {students.length === 0 ? (
        <EmptyState
          title="Add a student first"
          action={
            <Link href="/students/new" className="btn">
              Add a student
            </Link>
          }
        >
          Exams belong to a student, so you’ll need at least one.
        </EmptyState>
      ) : (
        <ExamForm
          action={createExam}
          students={students}
          preselectStudent={preselect}
          suggestions={suggestions}
          currencySymbol={currencySymbol(teacher.currency)}
          cancelHref={back.href}
        />
      )}
    </>
  )
}
