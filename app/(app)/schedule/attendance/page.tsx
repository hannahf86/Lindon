// =============================================================================
// schedule/attendance/page.tsx — Schedule → Attendance: go down a list and
// mark each lesson Present / Absent / Notice given / I cancelled, without
// opening each lesson (asked for by Hannah's colleague)
//
// · "Still to mark" — earlier lessons (last 8 weeks) never marked, shown when
//   looking at the current week, so nothing gets missed
// · The week's lessons, day by day, each with one-tap attendance buttons
// ‹ › moves a week at a time (/schedule/attendance?date=YYYY-MM-DD).
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { addDaysISO, fmtDate, fmtTz, isDateISO, rangeBoundsUtc, todayISO, utcToZonedParts, weekStartISO } from '@/lib/dates'
import { fullName } from '@/lib/format'
import { endTime } from '@/lib/lessons'
import { usesCredits } from '@/lib/features'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { AttendanceButtons } from '../../lessons/attendance-buttons'
import { ScheduleTabs } from '../tabs'

export const metadata: Metadata = { title: 'Attendance' }

const LESSON_FIELDS = 'id, starts_at, duration_minutes, status, instrument, location, students(id, first_name, last_name)'

export default async function AttendancePage({ searchParams }: PageProps<'/schedule/attendance'>) {
  const teacher = await requireTeacher()
  const tz = teacher.timezone
  const sp = await searchParams
  const today = todayISO(tz)
  const weekFrom = weekStartISO(isDateISO(sp.date) ? sp.date : today)
  const weekTo = addDaysISO(weekFrom, 6)
  const isThisWeek = weekFrom === weekStartISO(today)
  const credits = usesCredits(teacher)
  const [fromUtc, toUtc] = rangeBoundsUtc(weekFrom, weekTo, tz)
  const [backlogFrom] = rangeBoundsUtc(addDaysISO(weekFrom, -56), weekFrom, tz)

  const [week, backlog] = await Promise.all([
    db().from('lessons').select(LESSON_FIELDS).eq('teacher_id', teacher.id).gte('starts_at', fromUtc).lt('starts_at', toUtc).order('starts_at').then(must),
    isThisWeek
      ? db()
          .from('lessons')
          .select(LESSON_FIELDS)
          .eq('teacher_id', teacher.id)
          .eq('status', 'scheduled')
          .gte('starts_at', backlogFrom)
          .lt('starts_at', fromUtc)
          .order('starts_at')
          .then(must)
      : Promise.resolve([]),
  ])

  // Group the week by local date
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(weekFrom, i))
  const byDay = new Map<string, typeof week>()
  for (const l of week) {
    const d = utcToZonedParts(l.starts_at, tz).date
    byDay.set(d, [...(byDay.get(d) ?? []), l])
  }
  const toMark = week.filter((l) => l.status === 'scheduled' && l.starts_at < new Date().toISOString()).length + backlog.length
  const href = (date: string) => `/schedule/attendance?date=${date}`

  return (
    <>
      <PageHeader title="Schedule" subtitle="Mark attendance straight from the list — no need to open each lesson." />

      {/* ---- Tabs ---- */}
      <div style={{ marginBottom: 28 }}>
        <ScheduleTabs current="attendance" />
      </div>

      {/* ---- ‹ week › ---- */}
      <div className="cal-bar cal-bar-roomy">
        <nav className="cal-nav cal-nav-start" aria-label="Change week">
          <Link className="cal-nav-arrow" href={href(addDaysISO(weekFrom, -7))} aria-label="Previous week">
            ‹
          </Link>
          <span className="cal-nav-label">
            {fmtDate(weekFrom, 'd MMM')} – {fmtDate(weekTo, 'd MMM')}
          </span>
          <Link className="cal-nav-arrow" href={href(addDaysISO(weekFrom, 7))} aria-label="Next week">
            ›
          </Link>
          {!isThisWeek && (
            <Link className="btn btn-ghost btn-sm" href="/schedule/attendance">
              This week
            </Link>
          )}
        </nav>
        <span className="small muted">{toMark === 0 ? 'All caught up ✓' : `${toMark} lesson${toMark === 1 ? '' : 's'} still to mark`}</span>
      </div>

      <div className="stack">
        {/* ---- Earlier lessons never marked (current week only) ---- */}
        {backlog.length > 0 && (
          <Card title="Still to mark from earlier">
            <AttendanceList lessons={backlog} tz={tz} credits={credits} showDate />
          </Card>
        )}

        {/* ---- This week, day by day ---- */}
        {week.length === 0 ? (
          <Card>
            <EmptyState title="No lessons this week">Use ‹ › to look at another week.</EmptyState>
          </Card>
        ) : (
          days.map((d) => {
            const lessons = byDay.get(d) ?? []
            if (lessons.length === 0) return null
            return (
              <Card key={d} title={`${fmtDate(d, 'EEEE d MMMM')}${d === today ? ' · Today' : ''}`}>
                <AttendanceList lessons={lessons} tz={tz} credits={credits} />
              </Card>
            )
          })
        )}
      </div>
    </>
  )
}

// ---- One list of lessons, each with its attendance buttons ------------------------------
type ListLesson = {
  id: string
  starts_at: string
  duration_minutes: number
  status: string
  instrument: string
  location: string
  students: { id: string; first_name: string; last_name: string } | null
}

function AttendanceList({ lessons, tz, credits, showDate }: { lessons: ListLesson[]; tz: string; credits: boolean; showDate?: boolean }) {
  return (
    <ul className="att-list">
      {lessons.map((l) => {
        const start = fmtTz(l.starts_at, tz, 'HH:mm')
        return (
          <li key={l.id} className={`att-row ${l.status}`}>
            <div className="att-when">
              {showDate && <div className="small muted">{fmtTz(l.starts_at, tz, 'EEE d MMM')}</div>}
              <strong>
                {start}–{endTime(start, l.duration_minutes)}
              </strong>
            </div>
            <div className="att-who">
              <Link href={`/lessons/${l.id}`} style={{ fontWeight: 800 }}>
                {fullName(l.students) || 'Lesson'}
              </Link>
              {(l.instrument || l.location) && <div className="small muted">{[l.instrument, l.location].filter(Boolean).join(' · ')}</div>}
            </div>
            <AttendanceButtons lessonId={l.id} status={l.status as Parameters<typeof AttendanceButtons>[0]['status']} pupil={l.students?.first_name ?? 'The pupil'} credits={credits} small />
          </li>
        )
      })}
    </ul>
  )
}
