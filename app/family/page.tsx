// =============================================================================
// app/family/page.tsx — family home: everything coming up at a glance
//
// For each teacher they're linked to: the pupils, next lessons, latest lesson
// notes & homework, invoices waiting to be paid, upcoming exams and anything
// on loan. Every query is scoped to the link's teacher AND its pupil ids
// (from requireFamily) — never to ids from the URL.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must } from '@/lib/db'
import { requireFamily, type FamilyLink } from '@/lib/family'
import { TipOfTheDay } from '@/components/tip-of-the-day'
import { duration, hhmm, money } from '@/lib/format'
import { fmtDate, fmtTz, todayISO } from '@/lib/dates'
import { displayStatus } from '@/lib/invoices'
import { Badge, Card, EmptyState, StatusBadge } from '@/components/ui'
import { familyUnread, pupilNames, studioLine } from './_lib/family-data'

export const metadata: Metadata = { title: 'Home' }

// ---- Data for one teacher link ---------------------------------------------------------
async function loadLink(link: FamilyLink) {
  const ids = link.studentIds
  if (ids.length === 0) return null
  const t = link.teacher.id
  const now = new Date().toISOString()
  const today = todayISO(link.teacher.timezone)

  const [upcoming, past, invoices, exams, loans] = await Promise.all([
    db()
      .from('lessons')
      .select('id, student_id, starts_at, duration_minutes, instrument, location, status')
      .eq('teacher_id', t)
      .in('student_id', ids)
      .eq('status', 'scheduled')
      .gte('starts_at', now)
      .order('starts_at')
      .limit(5)
      .then(must),
    // Recent past lessons — the newest three with notes or homework are shown
    db()
      .from('lessons')
      .select('id, student_id, starts_at, instrument, notes, homework')
      .eq('teacher_id', t)
      .in('student_id', ids)
      .lt('starts_at', now)
      .order('starts_at', { ascending: false })
      .limit(40)
      .then(must),
    db()
      .from('invoices')
      .select('id, number, student_id, total, due_date, status')
      .eq('teacher_id', t)
      .in('student_id', ids)
      .eq('status', 'sent')
      .order('issue_date', { ascending: false })
      .then(must),
    db()
      .from('exams')
      .select('id, student_id, instrument, board, grade, exam_date, exam_time, venue, status')
      .eq('teacher_id', t)
      .in('student_id', ids)
      .gte('exam_date', today)
      .neq('status', 'withdrawn')
      .order('exam_date')
      .then(must),
    db()
      .from('loans')
      .select('id, student_id, lent_on, due_on, library_items(title, kind)')
      .eq('teacher_id', t)
      .in('student_id', ids)
      .is('returned_on', null)
      .order('lent_on', { ascending: false })
      .then(must),
  ])

  const notes = past.filter((l) => l.notes.trim() || l.homework.trim()).slice(0, 3)
  return { upcoming, notes, invoices, exams, loans, today }
}

export default async function FamilyHome() {
  const ctx = await requireFamily()
  const [unread, data] = await Promise.all([familyUnread(ctx), Promise.all(ctx.links.map(loadLink))])
  const firstName = ctx.name.split(' ')[0] || 'there'

  return (
    <>
      {/* ---- Greeting ---- */}
      <header className="page-head">
        <div>
          <h1>Hello, {firstName}</h1>
          <p>Here’s what’s coming up with your music lessons.</p>
        </div>
      </header>

      {/* ---- Tip of the day (same for everyone, changes daily) ---- */}
      <TipOfTheDay date={todayISO(ctx.links[0].teacher.timezone)} />

      {/* ---- Unread messages ---- */}
      {unread > 0 && (
        <div className="alert alert-ok spread" style={{ marginBottom: 20 }}>
          <span>
            You have {unread} new {unread === 1 ? 'message' : 'messages'} from your teacher.
          </span>
          <Link href="/family/messages" className="btn btn-sm">
            Read {unread === 1 ? 'it' : 'them'}
          </Link>
        </div>
      )}

      <div className="stack">
        {ctx.links.map((link, i) => (
          <TeacherSection key={link.accessId} link={link} data={data[i]} />
        ))}
      </div>
    </>
  )
}

// ---- One teacher's section ---------------------------------------------------------------
function TeacherSection({ link, data }: { link: FamilyLink; data: Awaited<ReturnType<typeof loadLink>> }) {
  const tz = link.teacher.timezone
  const c = link.teacher.currency
  const names = pupilNames(link)
  const many = link.pupils.length > 1
  const who = (id: string | null) => (many && id ? names.get(id) : null)

  return (
    <section className="stack" style={{ gap: 16 }}>
      {/* ---- Teacher + pupils ---- */}
      <div>
        <div className="eyebrow">Your teacher</div>
        <h2 style={{ fontSize: '1.5rem' }}>{studioLine(link.teacher)}</h2>
        {link.pupils.length > 0 && (
          <div className="chips" style={{ marginTop: 8 }}>
            {link.pupils.map((p) => (
              <span key={p.id} className="chip">
                {p.first_name} {p.last_name}
                {p.instruments.length > 0 && <span style={{ fontWeight: 600 }}>· {p.instruments.join(', ')}</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {!data ? (
        <Card>
          <EmptyState title="Nothing to show just yet">
            There aren’t any pupils linked to your account with this teacher at the moment. If you think that’s a mistake, send them a message.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          {/* ---- Next lessons ---- */}
          <Card title="Next lessons" actions={<Link href="/family/lessons" className="small">See all</Link>}>
            {data.upcoming.length === 0 ? (
              <p className="muted">No lessons booked at the moment.</p>
            ) : (
              <ul className="list">
                {data.upcoming.map((l) => (
                  <li key={l.id}>
                    <div style={{ fontWeight: 800 }}>{fmtTz(l.starts_at, tz, 'EEEE d MMMM')}</div>
                    <div className="small muted">
                      {fmtTz(l.starts_at, tz, 'HH:mm')} · {duration(l.duration_minutes)}
                      {l.instrument && ` · ${l.instrument}`}
                      {who(l.student_id) && ` · ${who(l.student_id)}`}
                      {l.location && ` · ${l.location}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- Latest notes & homework ---- */}
          <Card title="Latest notes & homework" actions={<Link href="/family/lessons?view=past" className="small">All notes</Link>}>
            {data.notes.length === 0 ? (
              <p className="muted">Your teacher’s lesson notes and homework will appear here.</p>
            ) : (
              <ul className="list">
                {data.notes.map((l) => (
                    <li key={l.id}>
                      <div className="spread">
                        <strong>{fmtTz(l.starts_at, tz, 'EEE d MMM')}{who(l.student_id) && ` · ${who(l.student_id)}`}</strong>
                        {l.instrument && <Badge tone="teal">{l.instrument}</Badge>}
                      </div>
                      {l.notes.trim() && <div className="pre small" style={{ marginTop: 4 }}>{l.notes}</div>}
                      {l.homework.trim() && (
                        <div className="small" style={{ marginTop: 6 }}>
                          <strong>Homework:</strong> <span className="pre">{l.homework}</span>
                        </div>
                      )}
                    </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- Invoices awaiting payment ---- */}
          <Card title="Invoices to pay" actions={<Link href="/family/invoices" className="small">All invoices</Link>}>
            {data.invoices.length === 0 ? (
              <p className="muted">You’re all paid up — thank you!</p>
            ) : (
              <ul className="list">
                {data.invoices.map((inv) => (
                  <li key={inv.id} className="spread">
                    <span>
                      <Link href={`/family/invoices/${inv.id}`} style={{ fontWeight: 800 }}>
                        {inv.number}
                      </Link>
                      <span className="small muted">
                        {inv.due_date ? ` · due ${fmtDate(inv.due_date, 'd MMM')}` : ''}
                        {who(inv.student_id) && ` · ${who(inv.student_id)}`}
                      </span>
                    </span>
                    <span className="row">
                      <strong>{money(inv.total, c)}</strong>
                      <StatusBadge status={displayStatus(inv, data.today)} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- Upcoming exams ---- */}
          <Card title="Upcoming exams">
            {data.exams.length === 0 ? (
              <p className="muted">No exams coming up.</p>
            ) : (
              <ul className="list">
                {data.exams.map((e) => (
                  <li key={e.id}>
                    <div style={{ fontWeight: 800 }}>
                      {fmtDate(e.exam_date, 'EEEE d MMMM yyyy')}
                      {e.exam_time && ` at ${hhmm(e.exam_time)}`}
                    </div>
                    <div className="small muted">
                      {[e.board, e.grade && `Grade ${e.grade.replace(/^grade\s*/i, '')}`, e.instrument].filter(Boolean).join(' · ')}
                      {who(e.student_id) && ` · ${who(e.student_id)}`}
                    </div>
                    {e.venue && <div className="small">Venue: {e.venue}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- Items on loan ---- */}
          <Card title="On loan from your teacher">
            {data.loans.length === 0 ? (
              <p className="muted">Nothing borrowed at the moment.</p>
            ) : (
              <ul className="list">
                {data.loans.map((l) => {
                  const overdue = !!l.due_on && l.due_on < data.today
                  return (
                    <li key={l.id} className="spread">
                      <span>
                        <strong>{l.library_items?.title ?? 'Item'}</strong>
                        <span className="small muted">
                          {l.library_items?.kind && ` · ${l.library_items.kind}`}
                          {who(l.student_id) && ` · ${who(l.student_id)}`}
                        </span>
                      </span>
                      {l.due_on ? (
                        <Badge tone={overdue ? 'coral' : 'sky'}>
                          {overdue ? 'Overdue — was due' : 'Due back'} {fmtDate(l.due_on, 'd MMM')}
                        </Badge>
                      ) : (
                        <Badge>Borrowed {fmtDate(l.lent_on, 'd MMM')}</Badge>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </section>
  )
}
