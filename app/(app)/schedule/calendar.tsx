// =============================================================================
// schedule/calendar.tsx — the teaching calendar (Day, Week or Month), shared by
// the Schedule page and the dashboard
//
// · calendarPeriod()   — which dates a view covers, plus prev/next/today links
// · <CalendarSwitch>   — the Day · Week · Month pills
// · <LessonCalendar>   — fetches and draws lessons, free slots and (when the
//   exams feature is on) exams, with optional totals for the period on top
//
// Lessons are shown in the teacher's timezone and coloured by status. Time
// inside the teacher's teaching hours that isn't booked shows faintly as
// "Free"; days with no teaching hours are greyed out as "Not a teaching day".
// A pupil's last booked lesson is marked so it's easy to see when to rebook.
// Events (concerts, exam days, group lessons…) show alongside lessons, and
// timed events come out of the free time.
//
// Click a day (a month square, a week column's "+ Add", or the day view's
// button) to add a one-off lesson or an event in a pop-up
// (components/day-adder.tsx). The month square's pop-up links to the day view.
// =============================================================================
import Link from 'next/link'
import { db, must } from '@/lib/db'
import { duration, fullName, hhmm, label, money } from '@/lib/format'
import { addDaysISO, fmtDate, fmtTz, isDateISO, isoWeekday, monthBounds, rangeBoundsUtc, utcToZonedParts, weekStartISO } from '@/lib/dates'
import { clock, currencySymbol, endTime, freeGaps, isCancelled, minutesOf, type Span } from '@/lib/lessons'
import { has, usesCredits } from '@/lib/features'
import type { Teacher } from '@/lib/database.types'
import { Badge, Card, EmptyState, Stat, StatusBadge } from '@/components/ui'
import { AttendanceButtons } from '../lessons/attendance-buttons'
import { AddDayButton, DayAdder, type AdderStudent } from '@/components/day-adder'
import { eventKindLabel, eventTimeLabel } from '@/lib/events'

export type CalendarView = 'day' | 'week' | 'month'
const VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
]
const MONTH_CHIPS = 3 // lessons shown per day in month view before "+N more"

// ---- Which dates, and navigation ------------------------------------------------------
export function calendarPeriod(sp: Record<string, string | string[] | undefined>, today: string, defaultView: CalendarView = 'week') {
  const view: CalendarView = sp.view === 'day' || sp.view === 'week' || sp.view === 'month' ? sp.view : defaultView
  const anchor = isDateISO(sp.date) ? sp.date : isDateISO(sp.week) ? sp.week : today
  const [monthStart, monthEnd] = monthBounds(anchor)

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

  const step = (dir: 1 | -1): string => {
    if (view === 'day') return addDaysISO(anchor, dir)
    if (view === 'week') return addDaysISO(periodFrom, 7 * dir)
    const [y, m] = monthStart.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10)
  }
  return {
    view,
    anchor,
    monthStart,
    monthEnd,
    periodFrom,
    periodTo,
    gridFrom,
    gridTo,
    prev: step(-1),
    next: step(1),
    isCurrent: view === 'day' ? anchor === today : view === 'week' ? periodFrom === weekStartISO(today) : monthStart === monthBounds(today)[0],
    title: view === 'day' ? fmtDate(anchor, 'EEEE d MMMM yyyy') : view === 'week' ? `Week of ${fmtDate(periodFrom, 'd MMMM yyyy')}` : fmtDate(monthStart, 'MMMM yyyy'),
    todayLabel: view === 'day' ? 'Today' : view === 'week' ? 'This week' : 'This month',
  }
}
export type CalendarPeriod = ReturnType<typeof calendarPeriod>

const calHref = (basePath: string, v: CalendarView, date: string) => `${basePath}?view=${v}&date=${date}`

// ---- Day · Week · Month pills ----------------------------------------------------------
export function CalendarSwitch({ basePath, period }: { basePath: string; period: CalendarPeriod }) {
  return (
    <nav className="segmented-links" aria-label="Calendar view">
      {VIEWS.map((v) => (
        <Link key={v.key} href={calHref(basePath, v.key, period.anchor)} aria-current={v.key === period.view ? 'page' : undefined}>
          {v.label}
        </Link>
      ))}
    </nav>
  )
}

// ---- The calendar itself -----------------------------------------------------------------
export async function LessonCalendar(props: { teacher: Teacher; period: CalendarPeriod; today: string; basePath: string; showTotals?: boolean }) {
  const { teacher, period: p, today, basePath } = props
  const tz = teacher.timezone
  const t = teacher.id
  const examsOn = has(teacher, 'exams')
  const credits = usesCredits(teacher)
  const href = (v: CalendarView, date: string) => calHref(basePath, v, date)

  const gridDays: string[] = []
  for (let d = p.gridFrom; d <= p.gridTo; d = addDaysISO(d, 1)) gridDays.push(d)
  const [fromUtc, toUtc] = rangeBoundsUtc(p.gridFrom, p.gridTo, tz)

  const [lessons, exams, slots, teachHours, events, adderStudents] = await Promise.all([
    db()
      .from('lessons')
      .select('id, starts_at, duration_minutes, price, status, chargeable, instrument, location, time_slot_id, students(id, first_name, last_name)')
      .eq('teacher_id', t)
      .gte('starts_at', fromUtc)
      .lt('starts_at', toUtc)
      .order('starts_at')
      .then(must),
    examsOn
      ? db()
          .from('exams')
          .select('id, exam_date, exam_time, board, grade, instrument, venue, status, students(first_name, last_name)')
          .eq('teacher_id', t)
          .gte('exam_date', p.gridFrom)
          .lte('exam_date', p.gridTo)
          .neq('status', 'withdrawn')
          .order('exam_time')
          .then(must)
      : Promise.resolve([]),
    db().from('time_slots').select('id, student_id, ends_on').eq('teacher_id', t).eq('active', true).not('student_id', 'is', null).then(must),
    db().from('teaching_hours').select('day_of_week, starts, ends').eq('teacher_id', t).order('starts').then(must),
    db()
      .from('events')
      .select('id, title, kind, event_date, starts, ends, location')
      .eq('teacher_id', t)
      .gte('event_date', p.gridFrom)
      .lte('event_date', p.gridTo)
      .order('starts', { nullsFirst: true })
      .then(must),
    loadAdderStudents(t),
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
    return d >= p.periodFrom && d <= p.periodTo
  })
  const taught = inPeriod.filter((l) => l.status === 'scheduled' || l.status === 'present' || l.status === 'absent')
  const hours = taught.reduce((sum, l) => sum + l.duration_minutes, 0) / 60
  const income = inPeriod.filter((l) => !isCancelled(l.status) && l.chargeable).reduce((sum, l) => sum + Number(l.price), 0)
  const cancelled = inPeriod.length - taught.length
  const periodWord = p.view === 'day' ? 'this day' : p.view === 'week' ? 'this week' : 'this month'

  // Last booked lesson per slot (to flag "last lesson — rebook?")
  const slotEnds = new Map(slots.filter((s) => s.student_id && s.ends_on).map((s) => [s.id, s.ends_on]))
  const isLastLesson = (l: (typeof lessons)[number], d: string) => !!l.time_slot_id && slotEnds.get(l.time_slot_id) === d

  /** Teaching hours that day (none = not a teaching day). */
  const hoursOn = (d: string) => teachHours.filter((h) => h.day_of_week === isoWeekday(d))
  /** Events on a date (all-day ones first). */
  const eventsOn = (d: string) => events.filter((e) => e.event_date === d)
  /** Free time on a date: teaching hours minus lessons going ahead and timed events. */
  const freeOn = (d: string, dayLessons: typeof lessons): Span[] => {
    const busy = dayLessons
      .filter((l) => !isCancelled(l.status))
      .map((l) => {
        const from = minutesOf(fmtTz(l.starts_at, tz, 'HH:mm'))
        return { from, to: from + l.duration_minutes }
      })
    for (const e of eventsOn(d)) {
      if (!e.starts) continue
      const from = minutesOf(e.starts.slice(0, 5))
      busy.push({ from, to: e.ends ? minutesOf(e.ends.slice(0, 5)) : from + 60 }) // no end time: assume an hour
    }
    return freeGaps(hoursOn(d), busy)
  }
  const freeLabel = (g: Span) => `${clock(g.from)}–${clock(g.to)}`

  return (
    <DayAdder students={adderStudents} locations={teacher.locations} currencySymbol={currencySymbol(teacher.currency)} dayHref={basePath}>
      {/* ---- Totals for the period ---- */}
      {props.showTotals && (
        <div className="grid grid-3" style={{ marginBottom: 20 }}>
          <Stat label="Lessons" value={taught.length} note={cancelled ? `plus ${cancelled} cancelled` : periodWord} tone="teal" />
          <Stat label="Teaching time" value={duration(Math.round(hours * 60))} note={`${hours.toFixed(1)} hours`} tone="butter" />
          <Stat label="Expected income" value={money(income, teacher.currency)} note="chargeable lessons, not cancelled" tone="purple" />
        </div>
      )}

      {/* ================================================================
          DAY VIEW — one roomy timeline with full details
         ================================================================ */}
      {p.view === 'day' &&
        (() => {
          const dayLessons = byDay.get(p.anchor) ?? []
          const dayExams = exams.filter((e) => e.exam_date === p.anchor)
          const dayFree = freeOn(p.anchor, dayLessons)
          const dayEvents = eventsOn(p.anchor)
          const rows = [
            ...dayEvents.map((ev) => ({ kind: 'event' as const, time: ev.starts ? ev.starts.slice(0, 5) : '00:00', ev })),
            ...dayLessons.map((l) => ({ kind: 'lesson' as const, time: fmtTz(l.starts_at, tz, 'HH:mm'), l })),
            ...dayExams.map((e) => ({ kind: 'exam' as const, time: e.exam_time ? hhmm(e.exam_time) : '00:00', e })),
            ...dayFree.map((g) => ({ kind: 'free' as const, time: clock(g.from), g })),
          ].sort((a, b) => a.time.localeCompare(b.time))
          return (
            <Card
              actions={
                <AddDayButton date={p.anchor} className="btn btn-sm">
                  + Add lesson or event
                </AddDayButton>
              }
            >
              {rows.length === 0 ? (
                <EmptyState title={hoursOn(p.anchor).length ? 'Nothing booked' : 'Not a teaching day'}>
                  {hoursOn(p.anchor).length ? 'No lessons on this day.' : 'You don’t have teaching hours on this day. Add some under Schedule → Teaching hours.'}
                </EmptyState>
              ) : (
                <ul className="dayview">
                  {rows.map((r) =>
                    r.kind === 'event' ? (
                      <li key={r.ev.id} className="dv-row happening">
                        <div className="dv-time">
                          {r.ev.starts ? r.time : 'All day'}
                          {r.ev.ends && <span>{r.ev.ends.slice(0, 5)}</span>}
                        </div>
                        <div className="dv-body">
                          <Link href={`/events/${r.ev.id}`} className="dv-title">
                            {r.ev.title}
                          </Link>
                          <div className="small muted">{[eventKindLabel(r.ev.kind), r.ev.location].filter(Boolean).join(' · ')}</div>
                        </div>
                        <Link href={`/events/${r.ev.id}`} className="btn btn-secondary btn-sm">
                          Open
                        </Link>
                      </li>
                    ) : r.kind === 'lesson' ? (
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
                              {isLastLesson(r.l, p.anchor) && <Badge tone="butter">Last booked lesson</Badge>}
                              <StatusBadge status={r.l.status} />
                            </span>
                          </div>
                          <div className="small muted">
                            {[duration(r.l.duration_minutes), r.l.instrument, r.l.location, money(r.l.price, teacher.currency)].filter(Boolean).join(' · ')}
                          </div>
                          {/* One-tap attendance */}
                          <div style={{ marginTop: 8 }}>
                            <AttendanceButtons lessonId={r.l.id} status={r.l.status} pupil={r.l.students?.first_name ?? 'The pupil'} credits={credits} small />
                          </div>
                        </div>
                        <Link href={`/lessons/${r.l.id}`} className="btn btn-secondary btn-sm">
                          Open
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
                      <li key={`free-${r.g.from}`} className="dv-row slot">
                        <div className="dv-time">
                          {r.time}
                          <span>{clock(r.g.to)}</span>
                        </div>
                        <div className="dv-body">
                          <span className="dv-title muted">Free</span>
                          <div className="small muted">{freeLabel(r.g)} · free to book</div>
                        </div>
                        <Link href="/schedule/slots" className="btn btn-ghost btn-sm">
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
      {p.view === 'week' && (
        <div className="week" style={{ marginBottom: 20 }}>
          {gridDays.map((d) => {
            const dayLessons = byDay.get(d) ?? []
            const dayExams = exams.filter((e) => e.exam_date === d)
            const dayFree = freeOn(d, dayLessons)
            const dayEvents = eventsOn(d)
            const off = hoursOn(d).length === 0
            const busyCount = dayLessons.length + dayExams.length + dayEvents.length
            return (
              <section key={d} className={`day ${d === today ? 'today' : ''} ${off ? 'off' : ''}`} aria-label={fmtDate(d, 'EEEE d MMMM')}>
                <Link href={href('day', d)} className="day-head">
                  <span>{fmtDate(d, 'EEE')}</span>
                  <span className="small muted">{fmtDate(d, 'd MMM')}</span>
                </Link>
                <AddDayButton date={d} className="day-add" label={`Add a lesson or event on ${fmtDate(d, 'EEEE d MMMM')}`}>
                  + Add
                </AddDayButton>

                {/* Events */}
                {dayEvents.map((ev) => (
                  <Link key={ev.id} href={`/events/${ev.id}`} className="event happening">
                    <div className="event-time">{eventTimeLabel(ev)}</div>
                    <div>{ev.title}</div>
                    <div className="small muted">{eventKindLabel(ev.kind)}</div>
                  </Link>
                ))}

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

                {/* Free time inside teaching hours */}
                {dayFree.map((g) => (
                  <Link key={`free-${g.from}`} href="/schedule/slots" className="event slot" title="Free to book — click to book a pupil">
                    <div className="event-time">{freeLabel(g)}</div>
                    <div className="small muted">Free</div>
                  </Link>
                ))}

                {off && busyCount === 0 && <p className="small muted">Not a teaching day</p>}
                {!off && busyCount + dayFree.length === 0 && <p className="small muted">Fully booked</p>}
              </section>
            )
          })}
        </div>
      )}

      {/* ================================================================
          MONTH VIEW — calendar grid; click a date to add a lesson or event
          (the pop-up links through to that day)
         ================================================================ */}
      {p.view === 'month' && (
        <div className="month">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
            <div key={w} className="month-dow">
              {w}
            </div>
          ))}
          {gridDays.map((d) => {
            const dayLessons = (byDay.get(d) ?? []).filter((l) => !isCancelled(l.status))
            const dayExams = exams.filter((e) => e.exam_date === d)
            const outside = d < p.monthStart || d > p.monthEnd
            const dayEvents = eventsOn(d)
            const extra = dayLessons.length - MONTH_CHIPS
            return (
              <AddDayButton
                key={d}
                date={d}
                className={`month-cell ${outside ? 'outside' : ''} ${d === today ? 'today' : ''} ${hoursOn(d).length === 0 ? 'off' : ''}`}
                label={`${fmtDate(d, 'EEEE d MMMM')}: ${dayLessons.length} lesson${dayLessons.length === 1 ? '' : 's'}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}. Add a lesson or event`}
              >
                <div className="month-date">{fmtDate(d, 'd')}</div>
                {dayEvents.map((ev) => (
                  <div key={ev.id} className="month-chip happening">
                    {ev.starts && <strong>{ev.starts.slice(0, 5)}</strong>} {ev.title}
                  </div>
                ))}
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
                {dayLessons.length + dayEvents.length > 0 && <div className="month-count">{dayLessons.length + dayEvents.length}</div>}
              </AddDayButton>
            )
          })}
        </div>
      )}
    </DayAdder>
  )
}

// ---- Students for the "add a lesson" pop-up, with their regular lesson details ---------
async function loadAdderStudents(teacherId: string): Promise<AdderStudent[]> {
  const [students, bookings] = await Promise.all([
    db().from('students').select('id, first_name, last_name, instruments').eq('teacher_id', teacherId).eq('status', 'active').order('first_name').then(must),
    db()
      .from('time_slots')
      .select('student_id, start_time, duration_minutes, price, instrument, location')
      .eq('teacher_id', teacherId)
      .eq('active', true)
      .not('student_id', 'is', null)
      .order('day_of_week')
      .then(must),
  ])
  return students.map((s) => {
    const b = bookings.find((x) => x.student_id === s.id)
    return {
      id: s.id,
      name: fullName(s),
      time: b ? hhmm(b.start_time) : '',
      duration: b?.duration_minutes ?? null,
      price: b ? Number(b.price) : null,
      instrument: b?.instrument || s.instruments[0] || '',
      location: b?.location ?? '',
    }
  })
}
