// =============================================================================
// exams/[id]/page.tsx — view, edit or delete one exam
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireTeacher } from '@/lib/db'
import { fullName, hhmm } from '@/lib/format'
import { fmtDate, todayISO } from '@/lib/dates'
import { studentOptions } from '@/lib/queries'
import { ConfirmButton } from '@/components/forms'
import { Card, PageHeader, StatusBadge } from '@/components/ui'
import { ExamForm } from '../exam-form'
import { deleteExam, updateExam } from '../actions'
import { DeadlineBadge, examSuggestions, examTitle } from '../helpers'
import { currencySymbol } from '../../library/helpers'

export const metadata: Metadata = { title: 'Exam' }

export default async function ExamPage({ params, searchParams }: PageProps<'/exams/[id]'>) {
  const { id } = await params
  const sp = await searchParams
  const teacher = await requireTeacher()
  const today = todayISO(teacher.timezone)

  const { data: exam } = await db()
    .from('exams')
    .select('*, students(id, first_name, last_name)')
    .eq('id', id)
    .eq('teacher_id', teacher.id)
    .maybeSingle()
  if (!exam) notFound()

  // Include students who have left, so an old exam still shows its student ticked
  const [students, suggestions] = await Promise.all([studentOptions(teacher.id, { includeLeft: true }), examSuggestions(teacher.id)])
  const { students: student, ...row } = exam

  return (
    <>
      <PageHeader
        title={`${student ? fullName(student) + ' — ' : ''}${examTitle(exam)}`}
        back={{ href: '/exams', label: 'Exams' }}
        subtitle={
          <span className="row" style={{ gap: 6 }}>
            <StatusBadge status={exam.status} />
            <span>
              {exam.exam_date ? fmtDate(exam.exam_date) : 'Date TBC'}
              {exam.exam_time && ` at ${hhmm(exam.exam_time)}`}
            </span>
            <DeadlineBadge exam={exam} today={today} />
            {student && (
              <span>
                · <Link href={`/students/${student.id}`}>View student</Link>
              </span>
            )}
          </span>
        }
      />

      {sp.saved === '1' && (
        <div className="alert alert-ok" style={{ marginBottom: 20 }}>
          Exam added.
        </div>
      )}

      {/* ---- Edit form ---- */}
      <ExamForm
        action={updateExam.bind(null, id)}
        exam={row}
        students={students}
        suggestions={suggestions}
        currencySymbol={currencySymbol(teacher.currency)}
        cancelHref="/exams"
      />

      {/* ---- Danger zone ---- */}
      <div style={{ marginTop: 20 }} />
      <Card className="no-print">
        <div className="spread">
          <p className="muted small" style={{ margin: 0 }}>
            If the student isn&apos;t taking it any more, you can set the status to “Withdrawn” instead of deleting.
          </p>
          <ConfirmButton action={deleteExam.bind(null, id)} confirm="Delete this exam? This can't be undone.">
            Delete exam
          </ConfirmButton>
        </div>
      </Card>
    </>
  )
}
