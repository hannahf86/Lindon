// =============================================================================
// lessons/page.tsx — Lessons: one row per pupil
//
// For each active pupil: their last lesson (and whether its attendance still
// needs marking) and their next lesson. Pupils who need attention are listed
// first. Click a name for their page; click the flag to jump to that lesson.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName } from '@/lib/format'
import { fmtTz } from '@/lib/dates'
import { isCancelled } from '@/lib/lessons'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'Lessons' }

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
      .select('id, student_id, starts_at, status')
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
    return { p, last, next: nextByPupil.get(p.id), unmarked: last?.status === 'scheduled' }
  })
  rows.sort((a, b) => Number(b.unmarked) - Number(a.unmarked)) // attention first, otherwise alphabetical
  const needCount = rows.filter((r) => r.unmarked).length

  return (
    <>
      <PageHeader
        title="Lessons"
        subtitle={needCount ? `${needCount} pupil${needCount === 1 ? ' needs' : 's need'} attendance marked for their last lesson.` : 'All caught up — every last lesson is marked.'}
        actions={
          <Link className="btn" href="/lessons/new">
            + One-off lesson
          </Link>
        }
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No active pupils">Add pupils and book them into time slots to see their lessons here.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pupil</th>
                  <th>Last lesson</th>
                  <th>Attendance</th>
                  <th>Next lesson</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, last, next, unmarked }) => (
                  <tr key={p.id}>
                    {/* ---- Name → their page ---- */}
                    <td>
                      <Link className="rowlink" href={`/students/${p.id}`}>
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
                          <Badge tone="coral">Needs marking</Badge>
                        </Link>
                      ) : last.status === 'absent' ? (
                        <Badge tone="butter">Absent</Badge>
                      ) : (
                        <Badge tone="teal">Present</Badge>
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
