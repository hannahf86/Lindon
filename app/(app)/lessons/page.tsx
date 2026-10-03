// =============================================================================
// lessons/page.tsx — Lessons & notes: one row per pupil
//
// For each active pupil: their last lesson (and whether its notes are
// missing or attendance isn't marked yet), and their next lesson. Pupils who
// need attention are listed first. Click a name to see all their notes on
// their own page; click the flag to jump straight to the lesson that needs it.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName } from '@/lib/format'
import { fmtTz } from '@/lib/dates'
import { isCancelled } from '@/lib/lessons'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'Lessons & notes' }

export default async function LessonsPage() {
  const teacher = await requireTeacher()
  const tz = teacher.timezone
  const t = teacher.id
  const nowIso = new Date().toISOString()

  const [pupils, past, future] = await Promise.all([
    db().from('students').select('id, first_name, last_name, instruments').eq('teacher_id', t).eq('status', 'active').order('first_name').then(must),
    // Recent past lessons, newest first (enough to find each pupil's latest)
    db()
      .from('lessons')
      .select('id, student_id, starts_at, status, notes, homework')
      .eq('teacher_id', t)
      .lt('starts_at', nowIso)
      .order('starts_at', { ascending: false })
      .limit(2000)
      .then(must),
    db()
      .from('lessons')
      .select('id, student_id, starts_at')
      .eq('teacher_id', t)
      .gte('starts_at', nowIso)
      .eq('status', 'scheduled')
      .order('starts_at')
      .limit(2000)
      .then(must),
  ])

  // ---- Latest lesson that went ahead (or should have) + next lesson, per pupil ----
  const lastByPupil = new Map<string, (typeof past)[number]>()
  for (const l of past) if (!isCancelled(l.status) && !lastByPupil.has(l.student_id)) lastByPupil.set(l.student_id, l)
  const nextByPupil = new Map<string, (typeof future)[number]>()
  for (const l of future) if (!nextByPupil.has(l.student_id)) nextByPupil.set(l.student_id, l)

  const rows = pupils.map((p) => {
    const last = lastByPupil.get(p.id)
    const unmarked = last?.status === 'scheduled'
    const missingNotes = !!last && last.status !== 'absent' && !last.notes && !last.homework
    return { p, last, next: nextByPupil.get(p.id), unmarked, missingNotes, needs: unmarked || missingNotes }
  })
  rows.sort((a, b) => Number(b.needs) - Number(a.needs)) // attention first, otherwise alphabetical
  const needCount = rows.filter((r) => r.needs).length

  return (
    <>
      <PageHeader
        title="Lessons & notes"
        subtitle={needCount ? `${needCount} pupil${needCount === 1 ? ' needs' : 's need'} notes or attendance for their last lesson.` : 'All caught up — every last lesson has notes.'}
        actions={
          <Link className="btn" href="/lessons/new">
            + One-off lesson
          </Link>
        }
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No active pupils">Add pupils and book them into time slots to start keeping lesson notes.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pupil</th>
                  <th>Last lesson</th>
                  <th>Notes</th>
                  <th>Next lesson</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, last, next, unmarked, missingNotes }) => (
                  <tr key={p.id}>
                    {/* ---- Name → their page, with every note ---- */}
                    <td>
                      <Link className="rowlink" href={`/students/${p.id}#notes`}>
                        {fullName(p)}
                      </Link>
                      {p.instruments.length > 0 && <div className="small muted">{p.instruments.join(', ')}</div>}
                    </td>
                    <td className="nowrap">
                      {last ? <Link href={`/lessons/${last.id}`}>{fmtTz(last.starts_at, tz, 'EEE d MMM')}</Link> : <span className="muted">—</span>}
                    </td>
                    {/* ---- The flag ---- */}
                    <td>
                      {!last ? (
                        <span className="muted small">No lessons yet</span>
                      ) : unmarked ? (
                        <Link href={`/lessons/${last.id}`} style={{ textDecoration: 'none' }}>
                          <Badge tone="coral">Attendance &amp; notes needed</Badge>
                        </Link>
                      ) : missingNotes ? (
                        <Link href={`/lessons/${last.id}#notes`} style={{ textDecoration: 'none' }}>
                          <Badge tone="coral">Notes missing</Badge>
                        </Link>
                      ) : last.status === 'absent' ? (
                        <Badge tone="butter">Absent</Badge>
                      ) : (
                        <Badge tone="teal">Up to date</Badge>
                      )}
                    </td>
                    <td className="nowrap">{next ? fmtTz(next.starts_at, tz, 'EEE d MMM, HH:mm') : <span className="muted small">None booked</span>}</td>
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
