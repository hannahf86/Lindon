// =============================================================================
// students/[id]/page.tsx — one student: details, parents, slots, lessons,
// invoices, loans and exams, with quick actions for each. Adults get a
// family-login card; for children it points to their parents instead.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, must, requireTeacher } from '@/lib/db'
import { ageFrom, currencySymbol, dayName, duration, fullName, hhmm, isMinor, money } from '@/lib/format'
import { fmtDate, fmtTz, todayISO } from '@/lib/dates'
import { bookingSummary } from '@/lib/lessons'
import { guardianOptions } from '@/lib/queries'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Picker } from '@/components/pickers'
import { Badge, Card, EmptyState, MoneyField, PageHeader, StatusBadge, TextField, Toggle } from '@/components/ui'
import { ChildLoginNote, FamilyAccessCard } from '../../contacts/family-access-card'
import { addGuardian, addManualCredit, deleteStudent, linkGuardian, removeCredit, toggleGuardianEmails } from '../actions'
import { REASON_TEXT } from '@/lib/credits'
import { endBooking } from '../../schedule/slots/actions'
import { inviteFamilyAction } from '../../contacts/family-actions'

export const metadata: Metadata = { title: 'Student' }

export default async function StudentPage({ params, searchParams }: PageProps<'/students/[id]'>) {
  const { id } = await params
  const sp = await searchParams
  const teacher = await requireTeacher()
  const tz = teacher.timezone

  const { data: s } = await db()
    .from('students')
    .select('*, student_guardians(relationship, is_primary, receives_emails, guardians(*))')
    .eq('id', id)
    .eq('teacher_id', teacher.id)
    .maybeSingle()
  if (!s) notFound()

  const nowIso = new Date().toISOString()
  const t = teacher.id
  const [slots, upcoming, recent, invoices, loans, exams, allGuardians, credits] = await Promise.all([
    db().from('time_slots').select('*').eq('teacher_id', t).eq('student_id', id).order('day_of_week').order('start_time').then(must),
    db().from('lessons').select('*').eq('teacher_id', t).eq('student_id', id).gte('starts_at', nowIso).order('starts_at').limit(5).then(must),
    db().from('lessons').select('*').eq('teacher_id', t).eq('student_id', id).lt('starts_at', nowIso).order('starts_at', { ascending: false }).limit(60).then(must),
    db().from('invoices').select('id, number, issue_date, status, total, due_date').eq('teacher_id', t).eq('student_id', id).order('issue_date', { ascending: false }).limit(10).then(must),
    db().from('loans').select('*, library_items(title, kind)').eq('teacher_id', t).eq('student_id', id).order('lent_on', { ascending: false }).then(must),
    db().from('exams').select('*').eq('teacher_id', t).eq('student_id', id).order('exam_date', { ascending: false }).then(must),
    guardianOptions(t),
    // Make-up credits, newest first (used ones show which invoice took them)
    db()
      .from('lesson_credits')
      .select('id, amount, reason, note, created_at, invoice_item_id, lessons(starts_at, instrument), invoice_items(invoices(id, number))')
      .eq('teacher_id', t)
      .eq('student_id', id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(must),
  ])
  const creditBalance = credits.filter((c) => !c.invoice_item_id).reduce((n, c) => n + Number(c.amount), 0)

  const minor = isMinor(s)
  const age = ageFrom(s.date_of_birth)
  const linkedIds = new Set(s.student_guardians.map((l) => l.guardians?.id))
  // Which linked parents already have a Lindon login (live invite)?
  const guardianIds = s.student_guardians.flatMap((l) => (l.guardians ? [l.guardians.id] : []))
  const { data: liveInvites } = guardianIds.length
    ? await db().from('family_access').select('guardian_id').eq('teacher_id', teacher.id).in('guardian_id', guardianIds).is('revoked_at', null)
    : { data: [] as { guardian_id: string | null }[] }
  const invitedIds = new Set((liveInvites ?? []).map((r) => r.guardian_id))
  const unlinked = allGuardians.filter((g) => !linkedIds.has(g.id))
  const today = todayISO(tz)

  return (
    <>
      <PageHeader
        title={fullName(s)}
        back={{ href: '/students', label: 'Students' }}
        subtitle={
          <span className="row" style={{ gap: 6 }}>
            <StatusBadge status={s.status} />
            {minor ? <Badge tone="butter">Child</Badge> : <Badge tone="purple">Adult</Badge>}
            {age !== null && <span>Age {age}</span>}
            {s.instruments.length > 0 && <span>· {s.instruments.join(', ')}</span>}
            {s.level && <span>· {s.level}</span>}
          </span>
        }
        actions={
          <>
            <Link className="btn btn-secondary" href={`/students/${id}/edit`}>
              Edit
            </Link>
            {/* In-app message: adults directly, children via their parents */}
            <Link className="btn btn-secondary" href={minor ? `/messages/new?pick=${id}` : `/messages/new?student=${id}`}>
              Message
            </Link>
            <Link className="btn btn-ghost" href={`/messages/email?to=${id}`}>
              Email
            </Link>
            <Link className="btn" href={`/invoices/new?student=${id}`}>
              New invoice
            </Link>
          </>
        }
      />

      {/* Back from editing a booking */}
      {typeof sp.booking === 'string' && (
        <div className="alert alert-ok" role="status" style={{ marginBottom: 20 }}>
          Booking saved. {sp.booking.slice(0, 300)}
        </div>
      )}

      {sp.new === '1' && minor && s.student_guardians.length === 0 && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          Student added. As they&apos;re under 18, add a parent or guardian below so reminders and invoices reach someone.
        </div>
      )}

      <div className="split">
        <div className="stack">
          {/* ---- Weekly time slots ---- */}
          <Card
            title="Booked lessons"
            actions={
              <Link className="btn btn-secondary btn-sm" href={`/schedule/slots?student=${id}`}>
                Book a slot
              </Link>
            }
          >
            {slots.length === 0 ? (
              <p className="muted">Not booked into a time slot yet.</p>
            ) : (
              <ul className="list">
                {slots.map((sl) => (
                  <li key={sl.id} className="spread">
                    <span>
                      <strong>
                        {dayName(sl.day_of_week)} {hhmm(sl.start_time)}
                      </strong>{' '}
                      · {duration(sl.duration_minutes)}
                      {sl.instrument && ` · ${sl.instrument}`}
                      {sl.location && ` · ${sl.location}`}
                      {!sl.active && (
                        <>
                          {' '}
                          <Badge>Paused</Badge>
                        </>
                      )}
                      {/* How often, and when the booking runs until */}
                      <div className="small muted">{bookingSummary(sl)}</div>
                      {sl.ends_on && sl.ends_on < today ? (
                        <Link href={`/schedule/slots/${sl.id}?from=/students/${id}`} style={{ textDecoration: 'none' }}>
                          <Badge tone="coral">Booking ended — rebook?</Badge>
                        </Link>
                      ) : !sl.ends_on ? (
                        <Link href={`/schedule/slots/${sl.id}?from=/students/${id}`} style={{ textDecoration: 'none' }}>
                          <Badge tone="coral">Set an end date</Badge>
                        </Link>
                      ) : null}
                      {/* ---- Edit / end this booking ---- */}
                      <div className="row" style={{ gap: 14, marginTop: 6 }}>
                        <Link href={`/schedule/slots/${sl.id}?from=/students/${id}`} className="link-btn">
                          Edit booking
                        </Link>
                        <ConfirmButton
                          action={endBooking.bind(null, sl.id)}
                          confirm={`End ${s.first_name}'s ${dayName(sl.day_of_week)} ${hhmm(sl.start_time)} booking? Their upcoming lessons from it are removed (past lessons and notes are kept, and anything already invoiced stays). The slot stays on your timetable as free.`}
                          className="link-btn"
                        >
                          End booking
                        </ConfirmButton>
                      </div>
                    </span>
                    <strong>{money(sl.price, teacher.currency)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- Upcoming lessons ---- */}
          <Card
            title="Upcoming lessons"
            actions={
              <Link className="btn btn-secondary btn-sm" href={`/lessons/new?student=${id}`}>
                + One-off lesson
              </Link>
            }
          >
            {upcoming.length === 0 ? (
              <p className="muted">Nothing booked. Book a time slot and their lessons are added for the dates you choose.</p>
            ) : (
              <ul className="list">
                {upcoming.map((l) => (
                  <li key={l.id} className="spread">
                    <Link href={`/lessons/${l.id}`} style={{ fontWeight: 800 }}>
                      {fmtTz(l.starts_at, tz, 'EEE d MMM, HH:mm')}
                    </Link>
                    <span className="small muted">
                      {duration(l.duration_minutes)}
                      {l.instrument && ` · ${l.instrument}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- Every lesson's notes, newest first ---- */}
          <Card title="Lesson notes" id="notes">
            {recent.length === 0 ? (
              <p className="muted">No lessons have happened yet.</p>
            ) : (
              <ul className="list notes-history">
                {recent.map((l) => {
                  const missing = !l.notes && !l.homework && (l.status === 'present' || l.status === 'scheduled')
                  return (
                    <li key={l.id}>
                      <div className="spread">
                        <Link href={`/lessons/${l.id}`} style={{ fontWeight: 800 }}>
                          {fmtTz(l.starts_at, tz, 'EEEE d MMMM yyyy')}
                        </Link>
                        <span className="row" style={{ gap: 6 }}>
                          {l.notes_emailed_at && <Badge tone="teal">Emailed</Badge>}
                          <StatusBadge status={l.status} />
                        </span>
                      </div>
                      {l.notes && <p className="note-text">{l.notes}</p>}
                      {l.homework && (
                        <p className="note-text">
                          <strong>Practice: </strong>
                          {l.homework}
                        </p>
                      )}
                      {missing && (
                        <Link href={`/lessons/${l.id}#notes`} className="small" style={{ fontWeight: 800, color: 'var(--coral-ink)' }}>
                          Notes missing — write them
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {/* ---- Invoices ---- */}
          <Card title="Invoices">
            {invoices.length === 0 ? (
              <p className="muted">No invoices yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <Link className="rowlink" href={`/invoices/${inv.id}`}>
                            {inv.number}
                          </Link>
                        </td>
                        <td>{fmtDate(inv.issue_date)}</td>
                        <td className="right">{money(inv.total, teacher.currency)}</td>
                        <td>
                          <StatusBadge status={inv.status === 'sent' && inv.due_date && inv.due_date < today ? 'overdue' : inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ---- Exams ---- */}
          <Card
            title="Exams"
            actions={
              <Link className="btn btn-secondary btn-sm" href={`/exams/new?student=${id}`}>
                + Add exam
              </Link>
            }
          >
            {exams.length === 0 ? (
              <p className="muted">No exams recorded.</p>
            ) : (
              <ul className="list">
                {exams.map((e) => (
                  <li key={e.id} className="spread">
                    <span>
                      <Link href={`/exams/${e.id}`} style={{ fontWeight: 800 }}>
                        {[e.board, e.instrument, e.grade].filter(Boolean).join(' · ') || 'Exam'}
                      </Link>
                      <span className="muted"> · {e.exam_date ? fmtDate(e.exam_date) : 'Date TBC'}</span>
                      {e.result && <span> · {e.result}</span>}
                    </span>
                    <StatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="stack">
          {/* ---- Contact ---- */}
          <Card title={minor ? 'Parents & guardians' : 'Contact'}>
            {!minor && (
              <ul className="list" style={{ marginBottom: 12 }}>
                <li>{s.email ? <a href={`mailto:${s.email}`}>{s.email}</a> : <span className="muted">No email</span>}</li>
                <li>{s.phone ? <a href={`tel:${s.phone}`}>{s.phone}</a> : <span className="muted">No phone</span>}</li>
                {s.address && <li style={{ whiteSpace: 'pre-line' }}>{s.address}</li>}
              </ul>
            )}
            {!minor && s.student_guardians.length > 0 && <h3 style={{ margin: '8px 0' }}>Linked contacts</h3>}
            {s.student_guardians.length === 0 && minor && (
              <p style={{ color: 'var(--coral-ink)', fontWeight: 700 }}>No parent linked — reminders can&apos;t be sent.</p>
            )}
            <ul className="list">
              {s.student_guardians.map(
                (link) =>
                  link.guardians && (
                    <li key={link.guardians.id} className="contact-lines">
                      {/* Name, with "Main contact" on the right; then email, phone, actions */}
                      <div className="spread" style={{ width: '100%' }}>
                        <Link href={`/contacts/${link.guardians.id}`} className="contact-name">
                          {fullName(link.guardians)}
                        </Link>
                        {link.is_primary && <Badge tone="teal">Main contact</Badge>}
                      </div>
                      {link.guardians.email && (
                        <a className="small" href={`mailto:${link.guardians.email}`}>
                          {link.guardians.email}
                        </a>
                      )}
                      {link.guardians.phone && (
                        <a className="small" href={`tel:${link.guardians.phone}`}>
                          {link.guardians.phone}
                        </a>
                      )}
                      <div className="row" style={{ gap: 14 }}>
                        <ConfirmButton
                          action={toggleGuardianEmails.bind(null, id, link.guardians.id, !link.receives_emails)}
                          confirm={link.receives_emails ? 'Stop emailing this contact about this student?' : 'Start emailing this contact again?'}
                          className="link-btn"
                        >
                          {link.receives_emails ? 'Emails: on' : 'Emails: off'}
                        </ConfirmButton>
                        {/* Portal invite — only while they don't have a login (unlinking lives on the contact page) */}
                        {!invitedIds.has(link.guardians.id) && link.guardians.email && (
                          <ConfirmButton
                            action={inviteFamilyAction.bind(null, 'guardian', link.guardians.id)}
                            confirm={`Invite ${fullName(link.guardians)} to Lindon? We'll email ${link.guardians.email} a sign-in link so they can see ${s.first_name}'s lessons, notes and invoices, and message you.`}
                            className="link-btn"
                          >
                            Invite to Lindon
                          </ConfirmButton>
                        )}
                      </div>
                    </li>
                  ),
              )}
            </ul>

            {/* Add a brand-new contact */}
            <details style={{ marginTop: 12 }} open={minor && s.student_guardians.length === 0}>
              <summary className="btn btn-secondary btn-sm">+ Add new parent / contact</summary>
              <div style={{ marginTop: 12 }}>
                <ActionForm action={addGuardian.bind(null, id)} resetOnSuccess>
                  <TextField label="First name" name="first_name" required />
                  <TextField label="Last name" name="last_name" />
                  <TextField label="Relationship" name="relationship" placeholder="e.g. Mum, Dad, Carer" />
                  <TextField label="Email" name="email" type="email" />
                  <TextField label="Phone" name="phone" type="tel" />
                  <Toggle name="is_primary" label="Main contact" defaultChecked={s.student_guardians.length === 0} />
                  <SubmitButton>Add contact</SubmitButton>
                </ActionForm>
              </div>
            </details>

            {/* Link an existing contact (e.g. a sibling's parent) */}
            {unlinked.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary className="btn btn-ghost btn-sm">Link an existing contact</summary>
                <div style={{ marginTop: 12 }}>
                  <ActionForm action={linkGuardian.bind(null, id)}>
                    <Picker name="guardian_id" label="Contact" options={unlinked} />
                    <TextField label="Relationship" name="relationship" placeholder="e.g. Mum" />
                    <Toggle name="is_primary" label="Main contact" />
                    <SubmitButton>Link contact</SubmitButton>
                  </ActionForm>
                </div>
              </details>
            )}
          </Card>

          {/* ---- Family login ---- */}
          {minor ? (
            <ChildLoginNote guardians={s.student_guardians.flatMap((l) => (l.guardians ? [l.guardians] : []))} />
          ) : (
            <FamilyAccessCard teacher={teacher} kind="student" id={id} name={fullName(s)} email={s.email} />
          )}

          {/* ---- Make-up credits ---- */}
          <Card title="Make-up credits" actions={<strong>{money(creditBalance, teacher.currency)} waiting</strong>}>
            <p className="small muted" style={{ marginTop: 0 }}>
              Added automatically when a lesson is marked “notice given” or “teacher cancelled”. Waiting credits come off the next invoice.
            </p>
            {credits.length === 0 ? (
              <p className="muted">No credits yet.</p>
            ) : (
              <ul className="list">
                {credits.map((cr) => {
                  const usedOn = cr.invoice_items?.invoices
                  return (
                    <li key={cr.id} className="spread">
                      <span>
                        <strong>{money(cr.amount, teacher.currency)}</strong>
                        <span className="small muted">
                          {' '}
                          ·{' '}
                          {cr.lessons
                            ? `${fmtTz(cr.lessons.starts_at, tz, 'EEE d MMM')} — ${REASON_TEXT[cr.reason]}`
                            : cr.note || 'Added by you'}
                        </span>
                      </span>
                      {usedOn ? (
                        <Link href={`/invoices/${usedOn.id}`} className="small">
                          Used on {usedOn.number}
                        </Link>
                      ) : cr.reason === 'manual' ? (
                        <ConfirmButton action={removeCredit.bind(null, id, cr.id)} confirm="Remove this credit?" className="link-btn">
                          Remove
                        </ConfirmButton>
                      ) : (
                        <Badge tone="teal">Waiting</Badge>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <details style={{ marginTop: 10 }}>
              <summary className="btn btn-ghost btn-sm">+ Add a credit by hand</summary>
              <div style={{ marginTop: 10 }}>
                <ActionForm action={addManualCredit.bind(null, id)} resetOnSuccess>
                  <MoneyField label="Amount" name="amount" symbol={currencySymbol(teacher.currency)} required />
                  <TextField label="Reason" name="note" placeholder="e.g. Goodwill — exam week" />
                  <SubmitButton>Add credit</SubmitButton>
                </ActionForm>
              </div>
            </details>
          </Card>

          {/* ---- Loans ---- */}
          <Card
            title="Borrowed items"
            actions={
              <Link className="btn btn-secondary btn-sm" href={`/library?lend_to=${id}`}>
                Lend item
              </Link>
            }
          >
            {loans.length === 0 ? (
              <p className="muted">Nothing borrowed.</p>
            ) : (
              <ul className="list">
                {loans.map((ln) => (
                  <li key={ln.id} className="spread">
                    <span>
                      <strong>{ln.library_items?.title}</strong>
                      <span className="muted small"> · since {fmtDate(ln.lent_on, 'd MMM yyyy')}</span>
                    </span>
                    {ln.returned_on ? (
                      <StatusBadge status="returned" />
                    ) : ln.due_on && ln.due_on < today ? (
                      <Badge tone="coral">Overdue</Badge>
                    ) : (
                      <StatusBadge status="on loan" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- Notes ---- */}
          {(s.notes || s.start_date) && (
            <Card title="Notes">
              {s.start_date && <p className="small muted">Started {fmtDate(s.start_date)}</p>}
              {s.notes && <p style={{ whiteSpace: 'pre-line' }}>{s.notes}</p>}
              {!s.reminders_enabled && <Badge tone="butter">Reminders off</Badge>}
            </Card>
          )}

          {/* ---- Danger zone ---- */}
          <Card>
            <ConfirmButton
              action={deleteStudent.bind(null, id)}
              confirm={`Delete ${fullName(s)}? This also deletes their lessons, notes, loans and exams. Invoices are kept. This can't be undone — consider setting them to "Left" instead.`}
            >
              Delete student
            </ConfirmButton>
          </Card>
        </div>
      </div>
      {upcoming.length === 0 && recent.length === 0 && slots.length === 0 && (
        <EmptyState title="Next step">Book {s.first_name} into a weekly time slot.</EmptyState>
      )}
    </>
  )
}
