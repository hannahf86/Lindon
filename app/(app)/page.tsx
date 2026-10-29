// =============================================================================
// app/(app)/page.tsx — the dashboard: today at a glance
// Greeting · new family messages (only when there are some) · stat tiles · today's lessons · things needing attention (notes,
// overdue invoices, exam deadlines, overdue loans, under-18s with no parent).
// Brand-new teachers see a short "getting started" checklist instead.
// =============================================================================
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { requireTeacher } from '@/lib/db'
import { loadDashboard } from '@/lib/dashboard'
import { TipOfTheDay } from '@/components/tip-of-the-day'
import { fmtDate, fmtTz } from '@/lib/dates'
import { dayName, duration, fullName, hhmm, money } from '@/lib/format'
import { Badge, Card, Stat, StatusBadge } from '@/components/ui'
import { DeadlineBadge, examTitle } from './exams/helpers'
import { loadInbox } from './messages/data'

export const metadata: Metadata = { title: 'Dashboard' }

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage() {
  const teacher = await requireTeacher()
  const tz = teacher.timezone
  const [d, unreadConversations] = await Promise.all([
    loadDashboard(teacher),
    // A side panel — never let a messages hiccup take the whole dashboard down
    loadInbox(teacher.id, { unreadOnly: true, limit: 5 }).catch(() => []),
  ])
  const now = new Date().toISOString()
  const firstName = (teacher.display_name || '').split(' ')[0]
  const settingsDone = !!(teacher.display_name && teacher.email)

  return (
    <>
      {/* ---- Greeting ---- */}
      <header className="page-head">
        <div>
          <div className="eyebrow">{fmtTz(now, tz, 'EEEE d MMMM yyyy')}</div>
          <h1>
            {greeting(Number(fmtTz(now, tz, 'H')))}
            {firstName && `, ${firstName}`}
          </h1>
        </div>
        <div className="page-actions">
          <Link href="/schedule" className="btn btn-secondary">
            Open schedule
          </Link>
        </div>
      </header>

      {/* ---- Tip of the day (same for everyone, changes daily) ---- */}
      <TipOfTheDay date={fmtTz(now, tz, 'yyyy-MM-dd')} />

      {/* ---- New messages from families ---- */}
      {unreadConversations.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Card title="New messages" actions={<Link href="/messages" className="btn btn-ghost btn-sm">Inbox →</Link>}>
            <ul className="list">
              {unreadConversations.map((c) => (
                <li key={c.id} className="spread" style={{ flexWrap: 'nowrap' }}>
                  <span style={{ minWidth: 0 }}>
                    <Link href={`/messages/${c.id}`} style={{ fontWeight: 800 }}>
                      {c.name}
                    </Link>
                    {c.latest && <span className="small muted"> · {fmtTz(c.latest.created_at, tz, 'EEE d MMM, HH:mm')}</span>}
                    {c.latest && (
                      <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.latest.body}
                      </div>
                    )}
                  </span>
                  <Badge tone="coral">{c.unread} new</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* ---- First-run guidance ---- */}
      {!d.hasStudents ? (
        <Card title="Welcome! Let’s get your studio set up">
          <p className="muted">Four quick steps and your lessons, reminders and invoices will look after themselves.</p>
          <ol className="list" style={{ listStyle: 'none' }}>
            <SetupStep n={1} done={settingsDone} href="/settings" title="Add your details">
              Your name, studio name and the email parents can reply to. Check your currency and timezone too.
            </SetupStep>
            <SetupStep n={2} done={false} href="/students/new" title="Add your students">
              For under-18s, add a parent or guardian so reminders and invoices reach them.
            </SetupStep>
            <SetupStep n={3} done={false} href="/schedule/slots" title="Set up your time slots">
              Your timetable — day, time, length and price.
            </SetupStep>
            <SetupStep n={4} done={false} href="/schedule/slots" title="Book pupils in">
              Choose a pupil, how often, and the first and last lesson (e.g. this half term). Their lessons appear on your schedule.
            </SetupStep>
          </ol>
        </Card>
      ) : (
        <>
          {/* ---- Stat tiles ---- */}
          <div className="grid grid-4" style={{ marginBottom: 20 }}>
            <Stat label="Lessons today" value={d.todaysLessons.filter((l) => l.status !== 'notice_given' && l.status !== 'teacher_cancelled').length} tone="teal" href="/schedule" />
            <Stat label="This week" value={d.weekLessonCount} note={`w/c ${fmtDate(d.weekStart, 'd MMM')}`} href="/schedule" />
            <Stat label="Active students" value={d.activeStudents} href="/students" />
            <Stat
              label="Outstanding"
              value={money(d.outstandingTotal, teacher.currency)}
              note={`${d.outstandingCount} unpaid invoice${d.outstandingCount === 1 ? '' : 's'}${d.overdueInvoices.length ? ` · ${d.overdueInvoices.length} overdue` : ''}`}
              tone={d.overdueInvoices.length ? 'coral' : 'butter'}
              href="/invoices"
            />
          </div>

          <div className="split">
            <div className="stack">
              {/* ---- Today's lessons ---- */}
              <Card title="Today’s lessons" actions={<Link href="/schedule" className="btn btn-ghost btn-sm">Schedule →</Link>}>
                {d.todaysLessons.length === 0 ? (
                  <p className="muted">No lessons today.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <tbody>
                        {d.todaysLessons.map((l) => (
                          <tr key={l.id}>
                            <td className="nowrap">
                              <Link className="rowlink" href={`/lessons/${l.id}`}>
                                {fmtTz(l.starts_at, tz, 'HH:mm')}
                              </Link>
                              <div className="small muted">{duration(l.duration_minutes)}</div>
                            </td>
                            <td>
                              <strong>{l.students ? fullName(l.students) : 'Student'}</strong>
                              <div className="small muted">{[l.instrument, l.location].filter(Boolean).join(' · ')}</div>
                            </td>
                            <td className="right">
                              <StatusBadge status={l.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* ---- Bookings ending soon (time to rebook for next half term) ---- */}
              {d.endingBookings.length > 0 && (
                <Card title="Bookings ending soon" actions={<span className="small muted">Time to rebook?</span>}>
                  <ul className="list">
                    {d.endingBookings.map((b) => (
                      <li key={b.id} className="spread">
                        <span>
                          <strong>{b.students ? fullName(b.students) : 'Pupil'}</strong>
                          <span className="muted small">
                            {' '}
                            · {dayName(b.day_of_week, true)} {hhmm(b.start_time)} ·{' '}
                            {b.ends_on! < d.today ? `ended ${fmtDate(b.ends_on, 'd MMM')}` : `last lesson ${fmtDate(b.ends_on, 'd MMM')}`}
                          </span>
                        </span>
                        <Link href={`/schedule/slots/${b.id}`} className="btn btn-secondary btn-sm">
                          Extend
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* ---- Lessons needing notes ---- */}
              <Card title="Lessons needing notes" actions={<span className="small muted">Last 14 days</span>}>
                {d.needNotes.length === 0 ? (
                  <p className="muted">All caught up — every recent lesson has notes.</p>
                ) : (
                  <ul className="list">
                    {d.needNotes.map((l) => (
                      <li key={l.id} className="spread">
                        <span>
                          <Link href={`/lessons/${l.id}`} style={{ fontWeight: 800 }}>
                            {l.students ? fullName(l.students) : 'Student'}
                          </Link>
                          <span className="muted small">
                            {' '}
                            · {fmtTz(l.starts_at, tz, 'EEE d MMM, HH:mm')}
                            {l.instrument && ` · ${l.instrument}`}
                          </span>
                        </span>
                        <Link href={`/lessons/${l.id}`} className="btn btn-secondary btn-sm">
                          Add notes
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* ---- Upcoming exams & entry deadlines ---- */}
              <Card title="Exams & entry deadlines" actions={<span className="small muted">Next 60 days</span>}>
                {d.upcomingExams.length === 0 ? (
                  <p className="muted">
                    Nothing in the next 60 days. <Link href="/exams">See all exams</Link>
                  </p>
                ) : (
                  <ul className="list">
                    {d.upcomingExams.map((e) => (
                      <li key={e.id} className="spread">
                        <span>
                          <Link href={`/exams/${e.id}`} style={{ fontWeight: 800 }}>
                            {e.students ? fullName(e.students) : 'Student'}
                          </Link>
                          <span className="small"> · {examTitle(e)}</span>
                          <div className="small muted">
                            {e.exam_date ? `Exam ${fmtDate(e.exam_date)}${e.exam_time ? ` at ${hhmm(e.exam_time)}` : ''}` : 'Exam date TBC'}
                            {e.status === 'planned' && e.entry_deadline && ` · enter by ${fmtDate(e.entry_deadline, 'd MMM')}`}
                          </div>
                        </span>
                        <span className="row" style={{ gap: 4 }}>
                          <DeadlineBadge exam={e} today={d.today} />
                          <StatusBadge status={e.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="stack">
              {/* ---- Overdue invoices ---- */}
              <Card title="Overdue invoices">
                {d.overdueInvoices.length === 0 ? (
                  <p className="muted">Nothing overdue.</p>
                ) : (
                  <ul className="list">
                    {d.overdueInvoices.map((inv) => (
                      <li key={inv.id} className="spread">
                        <span>
                          <Link href={`/invoices/${inv.id}`} style={{ fontWeight: 800 }}>
                            {inv.number}
                          </Link>
                          <span className="small"> · {inv.bill_to_name || (inv.students ? fullName(inv.students) : '')}</span>
                          <div className="small" style={{ color: 'var(--coral-ink)' }}>
                            Due {fmtDate(inv.due_date, 'd MMM yyyy')}
                          </div>
                        </span>
                        <strong>{money(inv.total, teacher.currency)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* ---- Items overdue for return ---- */}
              <Card title="Items overdue for return">
                {d.overdueLoans.length === 0 ? (
                  <p className="muted">Everything lent out is within its due date.</p>
                ) : (
                  <ul className="list">
                    {d.overdueLoans.map((l) => (
                      <li key={l.id}>
                        <Link href={`/library/${l.item_id}`} style={{ fontWeight: 800 }}>
                          {l.library_items?.title ?? 'Item'}
                        </Link>
                        <div className="small">
                          {l.students ? <Link href={`/students/${l.students.id}`}>{fullName(l.students)}</Link> : 'A student'}
                          <span style={{ color: 'var(--coral-ink)' }}> · due {fmtDate(l.due_on, 'd MMM')}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* ---- Under-18s with no parent linked ---- */}
              {d.minorsWithoutParent.length > 0 && (
                <Card title="No parent linked">
                  <p className="small muted">These under-18s won’t get reminders or invoices until you add a parent or guardian.</p>
                  <ul className="list">
                    {d.minorsWithoutParent.map((s) => (
                      <li key={s.id} className="spread">
                        <Link href={`/students/${s.id}`} style={{ fontWeight: 800 }}>
                          {fullName(s)}
                        </Link>
                        <Badge tone="butter">Child</Badge>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* ---- Profile nudge ---- */}
              {!settingsDone && (
                <Card>
                  <p style={{ margin: 0 }}>
                    <strong>Finish your profile:</strong> add your name and reply-to email in <Link href="/settings">Settings</Link> so emails come from you.
                  </p>
                </Card>
              )}
            </div>
          </div>
        </>
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
