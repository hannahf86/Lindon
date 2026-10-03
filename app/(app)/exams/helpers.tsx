// =============================================================================
// exams/helpers.tsx — shared bits for the exam pages and the dashboard:
// past-value suggestions for the form, the exam's title line, "is it
// upcoming?", and the entry-deadline warning badge.
// =============================================================================
import 'server-only'
import type { Exam } from '@/lib/database.types'
import { addDaysISO, fmtDate } from '@/lib/dates'
import { splitList } from '@/lib/format'
import { distinctValues, instrumentSuggestions } from '@/lib/queries'
import { Badge } from '@/components/ui'
import type { ExamSuggestions } from './exam-form'

/** The teacher's previously-typed values, offered as chips on the form. */
export async function examSuggestions(teacherId: string): Promise<ExamSuggestions> {
  const [instruments, examInstruments, boards, grades, venues] = await Promise.all([
    instrumentSuggestions(teacherId),
    distinctValues(teacherId, 'exams', 'instrument'),
    distinctValues(teacherId, 'exams', 'board'),
    distinctValues(teacherId, 'exams', 'grade'),
    distinctValues(teacherId, 'exams', 'venue'),
  ])
  return {
    instruments: splitList([...instruments, ...examInstruments].join(',')).slice(0, 24),
    boards,
    grades,
    venues,
  }
}

/** "ABRSM · Piano · Grade 3" */
export function examTitle(e: Pick<Exam, 'board' | 'instrument' | 'grade'>): string {
  return [e.board, e.instrument, e.grade].filter(Boolean).join(' · ') || 'Exam'
}

/** Still to happen: not taken/withdrawn, and either no date yet or on/after today. */
export function isUpcoming(e: Pick<Exam, 'status' | 'exam_date'>, today: string): boolean {
  if (e.status === 'taken' || e.status === 'withdrawn') return false
  return !e.exam_date || e.exam_date >= today
}

/** Warning when a planned exam's entry deadline is within 14 days (or has passed). */
export function DeadlineBadge({ exam, today }: { exam: Pick<Exam, 'status' | 'entry_deadline'>; today: string }) {
  if (exam.status !== 'planned' || !exam.entry_deadline) return null
  if (exam.entry_deadline < today) return <Badge tone="coral">Entry deadline passed</Badge>
  if (exam.entry_deadline <= addDaysISO(today, 14)) {
    return <Badge tone="coral">Enter by {exam.entry_deadline === today ? 'today' : fmtDate(exam.entry_deadline, 'EEE d MMM')}</Badge>
  }
  return null
}
