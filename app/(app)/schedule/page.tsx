// =============================================================================
// schedule/page.tsx — the teaching calendar: Day, Week or Month view
//
// /schedule?view=day|week|month&date=YYYY-MM-DD  (week is the default; the old
// ?week=YYYY-MM-DD links still work). Lessons are shown in the teacher's
// timezone and coloured by status; exams appear in purple; running slots with
// nobody booked on that date show faintly as "Free" (e.g. the off-week of a
// fortnightly pupil, or after a booking has ended). A pupil's last booked
// lesson is marked so it's easy to see when to rebook. Totals for the period
// sit at the top.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { duration, fullName, hhmm, label, money } from '@/lib/format'
import { addDaysISO, fmtDate, fmtTz, isDateISO, isoWeekday, monthBounds, rangeBoundsUtc, todayISO, utcToZonedParts, weekStartISO } from '@/lib/dates'
import { endTime, isBookingDate, isCancelled } from '@/lib/lessons'
import { Badge, Card, EmptyState, PageHeader, Stat, StatusBadge } from '@/components/ui'
import { ScheduleTabs } from './tabs'
import { AttendanceButtons } from '../lessons/attendance-buttons'

export const metadata: Metadata = { title: 'Schedule' }

type View = 'day' | 'week' | 'month'
const VIEWS: { key: View; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
]
const MONTH_CHIPS = 3 // lessons shown per day in month view before "+N more"

export default async function SchedulePage({ searchParams }: PageProps<'/schedule'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const tz = teacher.timezone
  const t = teacher.id
  const today = todayISO(tz)

  // ---- Which view, and which date ----
  const view: View = sp.view === 'day' || sp.view === 'month' ? sp.view : 'week'
  const anchor = isDateISO(sp.date) ? sp.date : isDateISO(sp.week) ? sp.week : today
  const [monthStart, monthEnd] = monthBounds(anchor)

  // The period the totals cover, and the dates drawn on screen
  let periodFrom: string, periodTo: string, gridFrom: string, gridTo: string
  if (view === 'day') {
    periodFrom = periodTo = gridFrom = gridTo = anchor
  } else if (view === 'week') {
    periodFrom = gridFrom = weekStartISO(anchor)
    periodTo = gridTo = addDaysISO(periodFrom, 6)
  } else {
    periodFrom = monthStart
    periodTo = monthEnd
    gridFrom = weekStartISO(monthStart) // pad to whole Mon–Sun weeks
    gridTo = addDaysISO(weekStartISO(monthEnd), 6)
  }
  const gridDays: string[] = []
  for (let d = gridFrom; d <= gridTo; d = addDaysISO(d, 1)) gridDays.push(d)
  const [fromUtc, toUtc] = rangeBoundsUtc(gridFrom, gridTo, tz)

  const [lessons, exams, slots] = await Promise.all([
    db()
      .from('lessons')
      .select('id, starts_at, duration_minutes, price, status, chargeable, instrument, location, time_slot_id, notes, students(id, first_name, last_name)')
      .eq('teacher_id', t)
      .gte('starts_at', fromUtc)
      .lt('starts_at', toUtc)
      .order('starts_at')
      .then(must),
    db()
      .from('exams')
      .select('id, exam_date, exam_time, board, grade, instrument, venue, status, students(first_name, last_name)')
      .eq('teacher_id', t)
      .gte('exam_date', gridFrom)
      .lte('exam_date', gridTo)
      .neq('status', 'withdrawn')
      .order('exam_time')
      .then(must),
    db()
      .from('time_slots')
      .select('id, day_of_week, start_time, duration_minutes, label, location, student_id, starts_on, ends_on, repeat_weeks, skip_dates')
      .eq('teacher_id', t)
      .eq('active', true)
      .order('start_time')
      .then(must),
  ])

  // Group lessons by their local (teacher-timezone) date
  const byDay = new Map<string, typeof lessons>()
  for (const l of lessons) {
    const d = utcToZonedParts(l.starts_at, tz).date
    byDay.set(d, [...(byDay.get(d) ?? []), l])
  }

  // ---- Totals for the period (month view ignores the padding days) ----
  const inPeriod = lessons.filter((l) => {
    const d = utcToZonedParts(l.starts_at, tz).date
    return d >= periodFrom && d <= periodTo
  })
  // Lessons that go ahead (or haven't happened yet); absences still count as teaching time booked
  const taught = inPeriod.filter((l) => l.status === 'scheduled' || l.status === 'present' || l.status === 'absent')
  const hours = taught.reduce((sum, l) => sum + l.duration_minutes, 0) / 60
  // Cancelled lessons earn a make-up credit, so they don't count as income
  const income = inPeriod.filter((l) => !isCancelled(l.status) && l.chargeable).reduce((sum, l) => sum + Number(l.price), 0)
  const cancelled = inPeriod.length - taught.length
  const periodWord = view === 'day' ? 'this day' : view === 'week' ? 'this week' : 'this month'

  // Last booked lesson per slot (to flag "last lesson — rebook?")
  const slotEnds = new Map(slots.filter((s) => s.student_id && s.ends_on).map((s) => [s.id, s.ends_on]))
  const isLastLesson = (l: (typeof lessons)[number], d: string) => !!l.time_slot_id && slotEnds.get(l.time_slot_id) === d

  /** Free slots on a date: nobody booked (or the booking doesn't cover it) and no lesson at that time. */
  const freeOn = (d: string, dayLessons: typeof lessons) => {
    const busy = new Set(dayLessons.map((l) => fmtTz(l.starts_at, tz, 'HH:mm')))
    return slots.filter((s) => s.day_of_week === isoWeekday(d) && !busy.has(hhmm(s.start_time)) && (!s.student_id || !isBookingDate(s, d)))
  }

  // ---- Navigation ----
  const href = (v: View, date: string) => `/schedule?view=${v}&date=${date}`
  const step = (dir: 1 | -1): string => {
    if (view === 'day') return addDaysISO(anchor, dir)
    if (view === 'week') return addDaysISO(periodFrom, 7 * dir)
    const [y, m] = monthStart.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10)
  }
  const isCurrent = view === 'day' ? anchor === today : view === 'week' ? periodFrom === weekStartISO(today) : monthStart === monthBounds(today)[0]
  const subtitle =
    view === 'day' ? fmtDate(anchor, 'EEEE d MMMM yyyy') : view === 'week' ? `Week of ${fmtDate(periodFrom, 'd MMMM yyyy')}` : fmtDate(monthStart, 'MMMM yyyy')
  const todayLabel = view === 'day' ? 'Today' : view === 'week' ? 'This week' : 'This month'

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={subtitle}
        actions={
          <>
            {/* ---- Previous / today / next ---- */}
            <Link className="btn btn-secondary" href={href(view, step(-1))}>
              ← Previous
            </Link>
            {!isCurrent && (
              <Link className="btn btn-secondary" href={href(view, today)}>
                {todayLabel}
              </Link>
            )}
            <Link className="btn btn-secondary" href={href(view, step(1))}>
              Next →
            </Link>
            <Link className="btn" href="/lessons/new">
              + One-off lesson
            </Link>
          </>
        }
      />

      {/* ---- Calendar / Time slots tabs, and the Day · Week · Month switch ---- */}
      <div className="spread" style={{ marginBottom: 20 }}>
        <ScheduleTabs current="calendar" />
        <nav className="segmented-links" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <Link key={v.key} href={href(v.key, anchor)} aria-current={v.key === view ? 'page' : undefined}>
              {v.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* ---- Totals for the period ---- */}
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <Stat label="Lessons" value={taught.length} note={cancelled ? `plus ${cancelled} cancelled (credited)` : periodWord} tone="teal" />
        <Stat label="Teaching time" value={duration(Math.round(hours * 60))} note={`${hours.toFixed(1)} hours`} tone="butter" />
        <Stat label="Expected income" value={money(income, teacher.currency)} note="chargeable lessons, not cancelled" tone="purple" />
      </div>

      {/* ================================================================
          DAY VIEW — one roomy timeline with full details
         ================================================================ */}
      {view === 'day' &&
        (() => {
          const dayLessons = byDay.get(anchor) ?? []
          const dayExams = exams.filter((e) => e.exam_date === anchor)
          const dayFree = freeOn(anchor, dayLessons)
          // Lessons, exams and free slots together, in time order
          const rows = [
            ...dayLessons.map((l) => ({ kind: 'lesson' as const, time: fmtTz(l.starts_at, tz, 'HH:mm'), l })),
            ...dayExams.map((e) => ({ kind: 'exam' as const, time: e.exam_time ? hhmm(e.exam_time) : '00:00', e })),
            ...dayFree.map((s) => ({ kind: 'free' as const, time: hhmm(s.start_time), s })),
          ].sort((a, b) => a.time.localeCompare(b.time))
          return (
            <Card>
              {rows.length === 0 ? (
                <EmptyState title="Nothing booked">No lessons, exams or free slots on this day.</EmptyState>
              ) : (
                <ul className="dayview">
                  {rows.map((r) =>
                    r.kind === 'lesson' ? (
                      <li key={r.l.id} className={`dv-row ${r.l.status}`}>
                        <div className="dv-time">
                          {r.time}
                          <span>{endTime(r.time, r.l.duration_minutes)}</span>
                        </div>
                        <div className="dv-body">
                          <div className="spread">
                            <Link href={`/lessons/${r.l.id}`} className="dv-title">
                              {fullName(r.l.students)}
                            </Link>
                            <span className="row" style={{ gap: 6 }}>
                              {isLastLesson(r.l, anchor) && <Badge tone="butter">Last booked lesson</Badge>}
                              <StatusBadge status={r.l.status} />
                            </span>
                          </div>
                          <div className="small muted">
                            {[duration(r.l.duration_minutes), r.l.instrument, r.l.location, money(r.l.price, teacher.currency)].filter(Boolean).join(' · ')}
                          </div>
                          {r.l.notes && <div className="small dv-notes">{r.l.notes}</div>}
                          {/* One-tap attendance */}
                          <div style={{ marginTop: 8 }}>
                            <AttendanceButtons lessonId={r.l.id} status={r.l.status} pupil={r.l.students?.first_name ?? 'The pupil'} small />
                          </div>
                        </div>
                        <Link href={`/lessons/${r.l.id}`} className="btn btn-secondary btn-sm">
                          {r.l.notes ? 'Open' : 'Add notes'}
                        </Link>
                      </li>
                    ) : r.kind === 'exam' ? (
                      <li key={r.e.id} className="dv-row exam">
                        <div className="dv-time">{r.e.exam_time ? r.time : 'Exam'}</div>
                        <div className="dv-body">
                          <Link href={`/exams/${r.e.id}`} className="dv-title">
                            Exam · {fullName(r.e.students)}
                          </Link>
                          <div className="small muted">{[r.e.board, r.e.instrument, r.e.grade, r.e.venue].filter(Boolean).join(' · ')}</div>
                        </div>
                        <Link href={`/exams/${r.e.id}`} className="btn btn-secondary btn-sm">
                          Open
                        </Link>
                      </li>
                    ) : (
                      <li key={r.s.id} className="dv-row slot">
                        <div className="dv-time">
                          {r.time}
                          <span>{endTime(r.time, r.s.duration_minutes)}</span>
                        </div>
                        <div className="dv-body">
                          <span className="dv-title muted">Free slot</span>
                          <div className="small muted">{[r.s.label, r.s.location].filter(Boolean).join(' · ') || 'Nobody booked on this date'}</div>
                        </div>
                        <Link href={`/schedule/slots/${r.s.id}`} className="btn btn-ghost btn-sm">
                          Book a pupil
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </Card>
          )
        })()}

      {/* ================================================================
          WEEK VIEW — seven columns (click a day's heading to open it)
         ================================================================ */}
      {view === 'week' && (
        <div className="week" style={{ marginBottom: 20 }}>
          {gridDays.map((d) => {
            const dayLessons = byDay.get(d) ?? []
            const dayExams = exams.filter((e) => e.exam_date === d)
            const dayFree = freeOn(d, dayLessons)
            return (
              <section key={d} className={`day ${d === today ? 'today' : ''}`} aria-label={fmtDate(d, 'EEEE d MMMM')}>
                <Link href={href('day', d)} className="day-head">
                  <span>{fmtDate(d, 'EEE')}</span>
                  <span className="small muted">{fmtDate(d, 'd MMM')}</span>
                </Link>

                {/* Exams */}
                {dayExams.map((e) => (
                  <Link key={e.id} href={`/exams/${e.id}`} className="event exam">
                    <div className="event-time">{e.exam_time ? hhmm(e.exam_time) : 'Exam'}</div>
                    <div>{fullName(e.students)}</div>
                    <div className="small muted">{[e.board, e.instrument, e.grade].filter(Boolean).join(' · ') || 'Exam'}</div>
                  </Link>
                ))}

                {/* Lessons */}
                {dayLessons.map((l) => (
                  <Link key={l.id} href={`/lessons/${l.id}`} className={`event ${l.status}`} title={label(l.status)}>
                    <div className="event-time">
                      {fmtTz(l.starts_at, tz, 'HH:mm')}–{endTime(fmtTz(l.starts_at, tz, 'HH:mm'), l.duration_minutes)}
                    </div>
                    <div>{fullName(l.students)}</div>
                    {isLastLesson(l, d) && (
                      <div style={{ marginTop: 2 }}>
                        <Badge tone="butter">Last booked lesson</Badge>
                      </div>
                    )}
                    {(l.instrument || l.status !== 'scheduled') && (
                      <div className="small muted">{[l.instrument, l.status !== 'scheduled' ? label(l.status) : ''].filter(Boolean).join(' · ')}</div>
                    )}
                  </Link>
                ))}

                {/* Free slots */}
                {dayFree.map((s) => (
                  <Link key={s.id} href={`/schedule/slots/${s.id}`} className="event slot" title="Free on this date — click to book a pupil">
                    <div className="event-time">{hhmm(s.start_time)}</div>
                    <div className="small muted">Free{s.label ? ` · ${s.label}` : ''}</div>
                  </Link>
                ))}

                {dayLessons.length + dayExams.length + dayFree.length === 0 && <p className="small muted">Nothing booked</p>}
              </section>
            )
          })}
        </div>
      )}

      {/* ================================================================
          MONTH VIEW — calendar grid; click a date to open that day
         ================================================================ */}
      {view === 'month' && (
        <div className="month">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
            <div key={w} className="month-dow">
              {w}
            </div>
          ))}
          {gridDays.map((d) => {
            const dayLessons = (byDay.get(d) ?? []).filter((l) => !isCancelled(l.status))
            const dayExams = exams.filter((e) => e.exam_date === d)
            const outside = d < monthStart || d > monthEnd
            const extra = dayLessons.length - MONTH_CHIPS
            return (
              <Link
                key={d}
                href={href('day', d)}
                className={`month-cell ${outside ? 'outside' : ''} ${d === today ? 'today' : ''}`}
                aria-label={`${fmtDate(d, 'EEEE d MMMM')}: ${dayLessons.length} lesson${dayLessons.length === 1 ? '' : 's'}`}
              >
                <div className="month-date">{fmtDate(d, 'd')}</div>
                {dayExams.map((e) => (
                  <div key={e.id} className="month-chip exam">
                    Exam · {e.students?.first_name}
                  </div>
                ))}
                {dayLessons.slice(0, MONTH_CHIPS).map((l) => (
                  <div key={l.id} className={`month-chip ${l.status}`}>
                    <strong>{fmtTz(l.starts_at, tz, 'HH:mm')}</strong> {l.students?.first_name}
                  </div>
                ))}
                {extra > 0 && <div className="month-more">+{extra} more</div>}
                {/* Narrow screens: just a count */}
                {dayLessons.length > 0 && <div className="month-count">{dayLessons.length}</div>}
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
