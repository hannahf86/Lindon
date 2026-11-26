// =============================================================================
// app/(app)/page.tsx — the dashboard (Hannah's wireframe)
//
// Tip of the day and a funny teaching quote at the very top (each switchable
// in Settings; families never see the quote). Then: Income this
// month · Free time · quick actions (Add a new student, Edit schedule). Then
// a compact calendar with the month dropdown and "Connect to calendar",
// ‹ › arrows to click through days / weeks / months,
// (Google Calendar is coming later) on the left, Day · Week · Month pills on
// the right (month view by default) — all above the fold. A short "Needs
// attention" list sits underneath; extras such as exams and loans only
// appear when switched on.
// New messages from families show above the calendar when there are some.
// Brand-new teachers see a short "getting started" checklist instead.
// =============================================================================
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { requireTeacher } from '@/lib/db'
import { loadDashboard } from '@/lib/dashboard'
import { has } from '@/lib/features'
import { TipOfTheDay } from '@/components/tip-of-the-day'
import { QuoteOfTheDay } from '@/components/quote-of-the-day'
import { MonthPicker } from '@/components/month-picker'
import { fmtDate, fmtTz, monthOptions, todayISO } from '@/lib/dates'
import { dayName, fullName, hhmm, money } from '@/lib/format'
import { Badge, Card } from '@/components/ui'
import { loadInbox } from './messages/data'
import { CalendarNav, CalendarSwitch, LessonCalendar, calendarPeriod } from './schedule/calendar'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage({ searchParams }: PageProps<'/'>) {
  const teacher = await requireTeacher()
  const tz = teacher.timezone
  const today = todayISO(tz)
  const period = calendarPeriod(await searchParams, today, 'month')
  const [d, unreadConversations] = await Promise.all([
    loadDashboard(teacher),
    // A side panel — never let a messages hiccup take the whole dashboard down
    has(teacher, 'messaging') ? loadInbox(teacher.id, { unreadOnly: true, limit: 5 }).catch(() => []) : Promise.resolve([]),
  ])
  const c = teacher.currency

  // ---- First run: nothing set up yet ----
  if (!d.hasStudents) {
    const settingsDone = !!(teacher.display_name && teacher.email)
    return (
      <>
        <header className="page-head">
          <div>
            <h1>Welcome to Lindon</h1>
            <p>Four quick steps and your lessons, reminders and invoices will look after themselves.</p>
          </div>
        </header>
        <Card title="Let’s get your studio set up">
          <ol className="list" style={{ listStyle: 'none' }}>
            <SetupStep n={1} done={settingsDone} href="/settings" title="Check your details">
              Your name, studio name, the email parents can reply to, and how you’d like to be paid.
            </SetupStep>
            <SetupStep n={2} done={false} href="/students/new" title="Add your students">
              For under-18s, add a parent or guardian so reminders and invoices reach them.
            </SetupStep>
            <SetupStep n={3} done={false} href="/schedule/slots" title="Set up your time slots">
              Your timetable — day, time, length and price.
            </SetupStep>
            <SetupStep n={4} done={false} href="/schedule/slots" title="Book pupils in">
              Choose a pupil, how often, and the first and last lesson (e.g. this half term).
            </SetupStep>
          </ol>
        </Card>
      </>
    )
  }

  // ---- Things needing attention (only what's switched on) ----
  const attention: { key: string; text: ReactNode; href: string; tone: 'coral' | 'butter' }[] = [
    ...d.needAttendance.map((l) => ({
      key: `att-${l.id}`,
      text: <>Mark attendance · {fullName(l.students)} · {fmtTz(l.starts_at, tz, 'EEE d MMM, HH:mm')}</>,
      href: '/schedule/attendance',
      tone: 'butter' as const,
    })),
    ...d.overdueInvoices.map((inv) => ({
      key: `inv-${inv.id}`,
      text: <>Overdue · {inv.number} · {inv.bill_to_name || fullName(inv.students)} · {money(inv.total, c)}</>,
      href: `/invoices/${inv.id}`,
      tone: 'coral' as const,
    })),
    ...d.endingBookings.map((b) => ({
      key: `book-${b.id}`,
      text: <>Booking {b.ends_on! < d.today ? 'ended' : 'ends'} {fmtDate(b.ends_on, 'd MMM')} · {fullName(b.students)} · {dayName(b.day_of_week, true)} {hhmm(b.start_time)}</>,
      href: `/schedule/slots/${b.id}`,
      tone: 'butter' as const,
    })),
    ...d.minorsWithoutParent.map((s) => ({ key: `min-${s.id}`, text: <>No parent linked · {fullName(s)}</>, href: `/students/${s.id}`, tone: 'coral' as const })),
    ...d.upcomingExams.map((e) => ({
      key: `exam-${e.id}`,
      text: <>Exam · {fullName(e.students)} · {e.status === 'planned' && e.entry_deadline ? `enter by ${fmtDate(e.entry_deadline, 'd MMM')}` : e.exam_date ? fmtDate(e.exam_date, 'd MMM') : 'date TBC'}</>,
      href: `/exams/${e.id}`,
      tone: 'butter' as const,
    })),
    ...d.overdueLoans.map((l) => ({ key: `loan-${l.id}`, text: <>Overdue return · {l.library_items?.title ?? 'Item'} · {fullName(l.students)}</>, href: `/library/${l.item_id}`, tone: 'coral' as const })),
  ]

  return (
    <>
      {/* ---- Tip + funny quote of the day (same for everyone, change daily; switches in Settings) ---- */}
      {(has(teacher, 'daily_tip') || has(teacher, 'daily_quote')) && (
        <div className="dash-daily">
          {has(teacher, 'daily_tip') && <TipOfTheDay date={today} />}
          {has(teacher, 'daily_quote') && <QuoteOfTheDay date={today} />}
        </div>
      )}

      {/* ---- Top row: income, free slots, quick actions ---- */}
      <div className="dash-top">
        <section className="dash-tile">
          <h2>Income this month</h2>
          <div className="big">{money(d.income, c)}</div>
          <div className="small muted">
            {d.paidCount} invoice{d.paidCount === 1 ? '' : 's'} paid · {money(d.outstandingTotal, c)} still outstanding
          </div>
          <Link href="/invoices" className="small" style={{ marginTop: 'auto', fontWeight: 800 }}>
            Invoices →
          </Link>
        </section>

        <section className="dash-tile">
          <h2>Free time</h2>
          {d.freeCount === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              {d.hasHours ? 'Fully booked for the next two weeks.' : <>Add your <Link href="/schedule/hours">teaching hours</Link> to see free time here.</>}
            </p>
          ) : (
            <>
              <div className="small muted">Unbooked teaching time, next two weeks</div>
              <ul className="free-list">
                {d.freeSlots.map((f) => (
                  <li key={`${f.date}-${f.from}`}>
                    <Link href={`/?view=day&date=${f.date}`}>
                      {fmtDate(f.date, 'EEE d MMM')} · {f.from}–{f.to}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="dash-actions">
          <Link href="/students/new" className="btn">
            Add a new student
          </Link>
          <Link href="/schedule/slots" className="btn btn-secondary">
            Edit schedule
          </Link>
        </div>
      </div>

      {/* ---- New messages from families (in-app messages switched on) ---- */}
      {unreadConversations.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Card title="New messages" actions={<Link href="/messages" className="btn btn-ghost btn-sm">Inbox →</Link>}>
            <ul className="list">
              {unreadConversations.map((conv) => (
                <li key={conv.id} className="spread" style={{ flexWrap: 'nowrap' }}>
                  <span style={{ minWidth: 0 }}>
                    <Link href={`/messages/${conv.id}`} style={{ fontWeight: 800 }}>
                      {conv.name}
                    </Link>
                    {conv.latest && (
                      <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.latest.body}
                      </div>
                    )}
                  </span>
                  <Badge tone="coral">{conv.unread} new</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* ---- Calendar bar: month dropdown + Connect to calendar | Day · Week · Month ---- */}
      <div className="cal-bar cal-bar-roomy">
        <div className="row" style={{ gap: 10 }}>
          <MonthPicker
            basePath="/"
            name="date"
            label="Calendar month"
            value={`${period.monthStart.slice(0, 7)}-01`}
            options={monthOptions(today).map((o) => ({ value: `${o.value}-01`, label: o.label }))}
            keep={{ view: 'month' }}
          />
          {/* Google Calendar push comes later */}
          <button type="button" className="btn btn-secondary btn-sm" disabled title="Coming soon">
            Connect to calendar <Badge>Coming soon</Badge>
          </button>
        </div>
        {/* ‹ previous · this day / week / month · next › */}
        <CalendarNav basePath="/" period={period} />
        <CalendarSwitch basePath="/" period={period} />
      </div>

      {/* ---- Calendar (compact on the dashboard) ---- */}
      <div className="dash-cal">
        <LessonCalendar teacher={teacher} period={period} today={today} basePath="/" />
      </div>

      {/* ---- Needs attention ---- */}
      {attention.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <Card title="Needs attention">
          <ul className="list">
            {attention.slice(0, 12).map((a) => (
              <li key={a.key} className="spread">
                <Link href={a.href} style={{ fontWeight: 700 }}>
                  {a.text}
                </Link>
                <Badge tone={a.tone}>{a.tone === 'coral' ? 'Urgent' : 'To do'}</Badge>
              </li>
            ))}
          </ul>
          {attention.length > 12 && <p className="small muted">…and {attention.length - 12} more.</p>}
          </Card>
        </div>
      )}
    </>
  )
}

// ---- First-run checklist row ------------------------------------------------------
function SetupStep(props: { n: number; done: boolean; href: string; title: string; children: ReactNode }) {
  return (
    <li className="spread">
      <span className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <span
          aria-hidden
          style={{
            flex: 'none',
            width: 32,
            height: 32,
            borderRadius: 999,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 900,
            background: props.done ? 'var(--teal-ink)' : 'var(--butter)',
            color: props.done ? '#fff' : 'var(--ink)',
          }}
        >
          {props.done ? '✓' : props.n}
        </span>
        <span>
          <strong>{props.title}</strong>
          <div className="small muted">{props.children}</div>
        </span>
      </span>
      <Link href={props.href} className={props.done ? 'btn btn-ghost btn-sm' : 'btn btn-sm'}>
        {props.done ? 'Review' : 'Start'}
      </Link>
    </li>
  )
}
