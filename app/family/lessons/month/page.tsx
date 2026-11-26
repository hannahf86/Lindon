// =============================================================================
// family/lessons/month/page.tsx — Lessons → Month: a calendar month for a
// family (?month=YYYY-MM)
//
// Shows their children's lessons (cancelled ones struck through), events the
// teacher has shared with them, and holidays / term breaks. ‹ › moves a month
// at a time. Under the grid, the same month as a day-by-day list — easier to
// read on a phone, where the grid only shows a count per day.
// Times are in the teacher's timezone, like the rest of the family area.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must } from '@/lib/db'
import { requireFamily } from '@/lib/family'
import { addDaysISO, fmtDate, fmtTz, monthBounds, rangeBoundsUtc, todayISO, weekStartISO } from '@/lib/dates'
import { duration } from '@/lib/format'
import { familyEvents } from '@/lib/event-sharing'
import { holidaysBetween } from '@/lib/holidays'
import { eventTimeLabel } from '@/lib/events'
import { Card, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'Month' }

type Item = { key: string; date: string; time: string; label: string; kind: 'lesson' | 'cancelled' | 'event' | 'holiday'; detail: string }

export default async function FamilyMonthPage({ searchParams }: PageProps<'/family/lessons/month'>) {
  const ctx = await requireFamily()
  const sp = await searchParams
  const tz = ctx.links[0].teacher.timezone
  const today = todayISO(tz)
  const anchor = typeof sp.month === 'string' && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : today
  const [monthStart, monthEnd] = monthBounds(anchor)
  const gridFrom = weekStartISO(monthStart)
  const gridTo = addDaysISO(weekStartISO(monthEnd), 6)
  const many = ctx.links.reduce((n, l) => n + l.pupils.length, 0) > 1

  // ---- Everything in the grid range, from each teacher ----
  const items: Item[] = []
  await Promise.all(
    ctx.links.map(async (l) => {
      if (!l.studentIds.length) return
      const ltz = l.teacher.timezone
      const [from, to] = rangeBoundsUtc(gridFrom, gridTo, ltz)
      const first = new Map(l.pupils.map((p) => [p.id, p.first_name]))
      const [lessons, events, holidays] = await Promise.all([
        db().from('lessons').select('id, student_id, starts_at, duration_minutes, status, instrument').eq('teacher_id', l.teacher.id).in('student_id', l.studentIds).gte('starts_at', from).lt('starts_at', to).order('starts_at').then(must),
        familyEvents(l.teacher.id, l.pupils, gridFrom),
        holidaysBetween(l.teacher.id, gridFrom, gridTo),
      ])
      for (const les of lessons) {
        const cancelled = les.status === 'notice_given' || les.status === 'teacher_cancelled'
        items.push({
          key: `l-${les.id}`,
          date: fmtTz(les.starts_at, ltz, 'yyyy-MM-dd'),
          time: fmtTz(les.starts_at, ltz, 'HH:mm'),
          label: many ? first.get(les.student_id) ?? 'Lesson' : 'Lesson',
          kind: cancelled ? 'cancelled' : 'lesson',
          detail: [duration(les.duration_minutes), les.instrument, cancelled ? 'cancelled' : ''].filter(Boolean).join(' · '),
        })
      }
      for (const e of events.filter((x) => x.event_date <= gridTo)) {
        items.push({ key: `e-${e.id}`, date: e.event_date, time: e.starts ? e.starts.slice(0, 5) : '', label: e.title, kind: 'event', detail: [eventTimeLabel(e), e.location].filter(Boolean).join(' · ') })
      }
      for (const h of holidays) {
        for (let d = h.starts_on < gridFrom ? gridFrom : h.starts_on; d <= h.ends_on && d <= gridTo; d = addDaysISO(d, 1)) {
          items.push({ key: `h-${h.id}-${d}`, date: d, time: '', label: h.name, kind: 'holiday', detail: 'No lessons' })
        }
      }
    }),
  )
  items.sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')))
  const byDay = new Map<string, Item[]>()
  for (const it of items) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it])

  const days: string[] = []
  for (let d = gridFrom; d <= gridTo; d = addDaysISO(d, 1)) days.push(d)
  const shift = (n: number) => {
    const [y, m] = monthStart.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
  }
  const monthItems = [...byDay.entries()].filter(([d]) => d >= monthStart && d <= monthEnd)

  return (
    <>
      <PageHeader title="Lessons" subtitle="Times are shown in your teacher’s local time." />

      {/* ---- Upcoming / Past / Month tabs ---- */}
      <nav className="tabs" aria-label="Which lessons">
        <Link href="/family/lessons">Upcoming</Link>
        <Link href="/family/lessons?view=past">Past lessons</Link>
        <Link href="/family/lessons/month" aria-current="page">
          Month
        </Link>
      </nav>

      {/* ---- ‹ month › ---- */}
      <div className="cal-bar cal-bar-roomy">
        <nav className="cal-nav cal-nav-start" aria-label="Change month">
          <Link className="cal-nav-arrow" href={`/family/lessons/month?month=${shift(-1)}`} aria-label="Previous month">
            ‹
          </Link>
          <span className="cal-nav-label">{fmtDate(monthStart, 'MMMM yyyy')}</span>
          <Link className="cal-nav-arrow" href={`/family/lessons/month?month=${shift(1)}`} aria-label="Next month">
            ›
          </Link>
          {monthStart !== monthBounds(today)[0] && (
            <Link className="btn btn-ghost btn-sm" href="/family/lessons/month">
              This month
            </Link>
          )}
        </nav>
        <span className="small muted fam-key">
          <span className="key lesson" /> Lesson <span className="key event" /> Event <span className="key holiday" /> Holiday
        </span>
      </div>

      {/* ---- The grid ---- */}
      <div className="month" style={{ marginBottom: 28 }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
          <div key={w} className="month-dow">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const list = byDay.get(d) ?? []
          const outside = d < monthStart || d > monthEnd
          return (
            <div key={d} className={`month-cell ${outside ? 'outside' : ''} ${d === today ? 'today' : ''} ${list.some((x) => x.kind === 'holiday') ? 'is-holiday' : ''}`}>
              <div className="month-date">{fmtDate(d, 'd')}</div>
              {list.slice(0, 3).map((it) => (
                <div key={it.key} className={`month-chip ${it.kind === 'event' ? 'happening' : it.kind === 'holiday' ? 'holiday' : it.kind === 'cancelled' ? 'notice_given' : ''}`} style={it.kind === 'cancelled' ? { textDecoration: 'line-through' } : undefined}>
                  {it.time && <strong>{it.time}</strong>} {it.label}
                </div>
              ))}
              {list.length > 3 && <div className="month-more">+{list.length - 3} more</div>}
              {list.length > 0 && <div className="month-count">{list.length}</div>}
            </div>
          )
        })}
      </div>

      {/* ---- Same month as a list (handy on phones) ---- */}
      <Card title={`${fmtDate(monthStart, 'MMMM')} at a glance`}>
        {monthItems.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing booked this month.
          </p>
        ) : (
          <ul className="list">
            {monthItems.map(([d, list]) => (
              <li key={d}>
                <div style={{ fontWeight: 800 }}>{fmtDate(d, 'EEEE d MMMM')}</div>
                {list.map((it) => (
                  <div key={it.key} className="small" style={{ textDecoration: it.kind === 'cancelled' ? 'line-through' : undefined }}>
                    <span className={`key ${it.kind === 'cancelled' ? 'lesson' : it.kind}`} /> {it.time && <strong>{it.time} </strong>}
                    {it.label}
                    {it.detail && <span className="muted"> · {it.detail}</span>}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
