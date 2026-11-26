// =============================================================================
// schedule/slots/page.tsx — Schedule → Free slots: every pupil's regular lesson (and any older unbooked slot), grouped by day,
// with booked / available / paused status, overlap warnings, and the
// "add a slot" form. /schedule/slots?student=<id> preselects that student;
// ?free=1 (optionally &day=1–7) switches the form to "Add a free slot" (no
// pupil), from the "+ Add a free slot" buttons.
// Layout: the booking form on the left, the slots by day on the right
// (Hannah's call). All table columns are left-aligned.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { diffDays, fmtDate, todayISO } from '@/lib/dates'
import { ScheduleTabs } from '../tabs'
import { dayName, duration, fullName, hhmm, money } from '@/lib/format'
import { bookingSummary, currencySymbol, endTime, findOverlaps } from '@/lib/lessons'
import { instrumentSuggestions, studentOptions } from '@/lib/queries'
import { Badge, Card, EmptyState, PageHeader, Stat } from '@/components/ui'
import { SlotForm } from './slot-form'
import { createSlot, deleteSlot } from './actions'
import { ConfirmButton } from '@/components/forms'
import { RowMenu } from '@/components/row-menu'

export const metadata: Metadata = { title: 'Free slots' }

export default async function SlotsPage({ searchParams }: PageProps<'/schedule/slots'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const t = teacher.id
  const preselect = typeof sp.student === 'string' && /^[0-9a-f-]{36}$/i.test(sp.student) ? sp.student : null
  const freeMode = sp.free === '1'
  const freeDay = typeof sp.day === 'string' && /^[1-7]$/.test(sp.day) ? Number(sp.day) : undefined
  const savedId = typeof sp.saved === 'string' ? sp.saved : null
  const savedMsg = typeof sp.msg === 'string' ? sp.msg.slice(0, 400) : ''
  const today = todayISO(teacher.timezone)

  const [slots, students, instruments, locations] = await Promise.all([
    db()
      .from('time_slots')
      .select('*, students(id, first_name, last_name, status, instruments)')
      .eq('teacher_id', t)
      .order('day_of_week')
      .order('start_time')
      .then(must),
    studentOptions(t),
    instrumentSuggestions(t),
    Promise.resolve(teacher.locations),
  ])

  // Preselected student (from their page's "Book a slot" link)
  const { data: preStudent } = preselect
    ? await db().from('students').select('id, first_name, last_name, instruments').eq('id', preselect).eq('teacher_id', t).maybeSingle()
    : { data: null }

  const overlaps = findOverlaps(slots)
  const active = slots.filter((s) => s.active)
  // A booking that has ended leaves the slot free again
  const bookingState = (s: (typeof slots)[number]) =>
    !s.student_id ? 'free' : !s.ends_on ? 'open' : s.ends_on < today ? 'ended' : diffDays(today, s.ends_on) <= 14 ? 'ending' : 'booked'
  const booked = active.filter((s) => ['booked', 'ending', 'open'].includes(bookingState(s)))
  const weeklyIncome = booked.reduce((sum, s) => sum + Number(s.price), 0)
  const savedSlot = savedId ? slots.find((s) => s.id === savedId) : undefined

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Each pupil’s regular lesson: day, time, length, price and how often. Lessons keep going until the end date — or for good if there isn’t one."
      />
      <div style={{ marginBottom: 20 }}>
        <ScheduleTabs current="slots" />
      </div>

      {/* ---- Just saved (with overlap warning) ---- */}
      {savedSlot && (
        <div className={`alert ${overlaps.has(savedSlot.id) ? 'alert-info' : 'alert-ok'}`} role="status" style={{ marginBottom: 20 }}>
          Slot saved: {dayName(savedSlot.day_of_week)} {hhmm(savedSlot.start_time)}. {savedMsg}
          {overlaps.has(savedSlot.id) && (
            <>
              {' '}
              Heads up — it overlaps with{' '}
              {overlaps
                .get(savedSlot.id)!
                .map((o) => `${hhmm(o.start_time)}${o.students ? ` (${fullName(o.students)})` : ''}`)
                .join(', ')}{' '}
              on the same day. That&apos;s fine if it&apos;s intentional (e.g. a group lesson).
            </>
          )}
        </div>
      )}

      {/* ---- Summary ---- */}
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <Stat label="Booked slots" value={booked.length} note={`of ${active.length} running`} tone="teal" />
        <Stat label="Available" value={active.length - booked.length} note="free, or the booking has ended" tone="butter" />
        <Stat label="Weekly value" value={money(weeklyIncome, teacher.currency)} note="if every booked slot runs" tone="purple" />
      </div>

      <div className="split split-form-first">
        {/* ---- Book a lesson (left, the main thing on this page) ---- */}
        <Card
          title={freeMode ? 'Add a free slot' : preStudent ? `Book a lesson for ${fullName(preStudent)}` : 'Book a regular lesson'}
          id="add"
          actions={
            freeMode ? (
              <Link href="/schedule/slots" className="btn btn-ghost btn-sm">
                Book a pupil instead
              </Link>
            ) : null
          }
        >
          {freeMode ? (
            <p className="small muted">A time you’re free to teach. Leave Student as “Unbooked / available” — you can book a pupil into it later.</p>
          ) : (
            preStudent && <p className="small muted">Pick the day and time — {preStudent.first_name} is already chosen below.</p>
          )}
          <SlotForm
            // Remount when switching between "book a pupil" and "add a free slot"
            key={`${freeMode ? 'free' : 'book'}-${freeDay ?? ''}-${preStudent?.id ?? ''}`}
            action={createSlot}
            students={students}
            studentId={freeMode ? null : (preStudent?.id ?? null)}
            defaultDay={freeDay}
            defaultInstrument={freeMode ? '' : (preStudent?.instruments[0] ?? '')}
            instrumentSuggestions={instruments}
            locations={locations}
            currencySymbol={currencySymbol(teacher.currency)}
          />
        </Card>

        {/* ---- Free slots & bookings, grouped by day (right) ---- */}
        <div className="stack">
          <div>
            <Link href="/schedule/slots?free=1#add" className="btn btn-secondary">
              + Add a free slot
            </Link>
          </div>
          {slots.length === 0 ? (
            <Card>
              <EmptyState title="No bookings yet">Book a pupil’s regular lesson using the form.</EmptyState>
            </Card>
          ) : (
            [1, 2, 3, 4, 5, 6, 7].map((day) => {
              const daySlots = slots.filter((s) => s.day_of_week === day)
              if (daySlots.length === 0) return null
              return (
                <Card
                  key={day}
                  title={dayName(day)}
                  actions={
                    <Link href={`/schedule/slots?free=1&day=${day}#add`} className="btn btn-ghost btn-sm">
                      + Free slot
                    </Link>
                  }
                >
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Student</th>
                          <th>Details</th>
                          <th>Price</th>
                          <th>Status</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {daySlots.map((s) => {
                          const clash = overlaps.get(s.id)
                          return (
                            <tr key={s.id} id={`slot-${s.id}`} style={s.active ? undefined : { opacity: 0.6 }}>
                              <td className="nowrap">
                                <strong>
                                  {hhmm(s.start_time)}–{endTime(hhmm(s.start_time), s.duration_minutes)}
                                </strong>
                                <div className="small muted">{duration(s.duration_minutes)}</div>
                              </td>
                              <td>
                                {s.students ? (
                                  <Link className="rowlink" href={`/students/${s.students.id}`}>
                                    {fullName(s.students)}
                                  </Link>
                                ) : (
                                  <Badge tone="butter">Available</Badge>
                                )}
                                {/* Booking dates & frequency */}
                                {s.student_id && (
                                  <div className="small muted" style={{ marginTop: 2 }}>
                                    {bookingSummary(s)}
                                  </div>
                                )}
                                {s.students && s.students.status !== 'active' && (
                                  <>
                                    {' '}
                                    <Badge>{s.students.status === 'paused' ? 'Student paused' : 'Student left'}</Badge>
                                  </>
                                )}
                              </td>
                              <td className="small">
                                {[s.label, s.instrument, s.location].filter(Boolean).join(' · ') || <span className="muted">—</span>}
                                {clash && (
                                  <div style={{ marginTop: 4 }}>
                                    <Badge tone="coral">
                                      Overlaps {clash.map((o) => hhmm(o.start_time)).join(', ')}
                                    </Badge>
                                  </div>
                                )}
                              </td>
                              <td className="nowrap">{money(s.price, teacher.currency)}</td>
                              <td>
                                {!s.active ? (
                                  <Badge>Paused</Badge>
                                ) : (
                                  {
                                    free: <Badge tone="sky">Free</Badge>,
                                    booked: <Badge tone="teal">Booked</Badge>,
                                    ending: <Badge tone="butter">Ends {fmtDate(s.ends_on, 'd MMM')}</Badge>,
                                    ended: <Badge tone="coral">Booking ended</Badge>,
                                    open: <Badge tone="teal">Booked</Badge>,
                                  }[bookingState(s)]
                                )}
                              </td>
                              {/* ---- Row menu: edit · delete ---- */}
                              <td className="row-actions">
                                <RowMenu label={`Options for ${dayName(s.day_of_week)} ${hhmm(s.start_time)}`}>
                                  <Link role="menuitem" href={`/schedule/slots/${s.id}`}>
                                    Edit
                                  </Link>
                                  <ConfirmButton
                                    action={deleteSlot.bind(null, s.id)}
                                    confirm={`Delete the ${dayName(s.day_of_week)} ${hhmm(s.start_time)} slot${s.students ? ` (${fullName(s.students)})` : ''}? Lessons already made from it are kept. This can't be undone — you can switch the slot off instead (Edit → Slot is running).`}
                                    className="danger"
                                  >
                                    Delete
                                  </ConfirmButton>
                                </RowMenu>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )
            })
          )}
        </div>

      </div>
    </>
  )
}
