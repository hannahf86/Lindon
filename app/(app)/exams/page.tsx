// =============================================================================
// exams/page.tsx — exam list
// Tabs: Upcoming (soonest first, undated at the end) · Past · All.
// Entry deadlines within 14 days are flagged so nothing gets missed.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName, hhmm, money } from '@/lib/format'
import { fmtDate, todayISO } from '@/lib/dates'
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { DeadlineBadge, examTitle, isUpcoming } from './helpers'

export const metadata: Metadata = { title: 'Exams' }

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
] as const
type TabKey = (typeof TABS)[number]['key']

export default async function ExamsPage({ searchParams }: PageProps<'/exams'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const tab: TabKey = TABS.find((t) => t.key === sp.tab)?.key ?? 'upcoming'
  const today = todayISO(teacher.timezone)

  const exams = must(
    await db()
      .from('exams')
      .select('*, students(id, first_name, last_name)')
      .eq('teacher_id', teacher.id)
      .order('exam_date', { ascending: true, nullsFirst: false }),
  )

  // ---- Split into upcoming / past and sort each sensibly ----
  const upcoming = exams.filter((e) => isUpcoming(e, today))
  // Most recent first; undated ones at the end
  const past = exams.filter((e) => !isUpcoming(e, today)).sort((a, b) => (b.exam_date ?? '').localeCompare(a.exam_date ?? ''))
  const visible = tab === 'upcoming' ? upcoming : tab === 'past' ? past : [...upcoming, ...past]
  const counts: Record<TabKey, number> = { upcoming: upcoming.length, past: past.length, all: exams.length }

  return (
    <>
      <PageHeader
        title="Exams"
        subtitle="Graded exams your students are working towards, with entry deadlines and results."
        actions={
          <Link href="/exams/new" className="btn">
            + Add exam
          </Link>
        }
      />

      {/* ---- Tabs ---- */}
      <nav className="tabs" aria-label="Filter exams">
        {TABS.map((t) => (
          <Link key={t.key} href={`/exams?tab=${t.key}`} aria-current={t.key === tab ? 'page' : undefined}>
            {t.label} ({counts[t.key]})
          </Link>
        ))}
      </nav>

      {/* ---- Table ---- */}
      <Card>
        {visible.length === 0 ? (
          <EmptyState
            title={exams.length === 0 ? 'No exams yet' : tab === 'upcoming' ? 'Nothing coming up' : 'No past exams'}
            action={
              <Link href="/exams/new" className="btn">
                Add an exam
              </Link>
            }
          >
            {exams.length === 0 ? 'Record the exams your students are preparing for and you’ll get a nudge before entry deadlines.' : undefined}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Exam</th>
                  <th>Entry deadline</th>
                  <th>Fee</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">
                      <Link className="rowlink" href={`/exams/${e.id}`}>
                        {e.exam_date ? fmtDate(e.exam_date) : 'Date TBC'}
                      </Link>
                      {e.exam_time && <div className="small muted">{hhmm(e.exam_time)}</div>}
                    </td>
                    <td>{e.students ? <Link href={`/students/${e.students.id}`}>{fullName(e.students)}</Link> : <span className="muted">—</span>}</td>
                    <td>
                      {examTitle(e)}
                      {e.venue && <div className="small muted">{e.venue}</div>}
                      {e.result && <div className="small">Result: {e.result}</div>}
                    </td>
                    <td className="small">
                      {e.entry_deadline ? fmtDate(e.entry_deadline, 'd MMM yyyy') : <span className="muted">—</span>}
                      <div>
                        <DeadlineBadge exam={e} today={today} />
                      </div>
                    </td>
                    <td className="nowrap">{e.fee !== null ? money(e.fee, teacher.currency) : <span className="muted">—</span>}</td>
                    <td>
                      <StatusBadge status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
