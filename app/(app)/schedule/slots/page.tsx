// =============================================================================
// schedule/slots/page.tsx — the weekly timetable (Schedule → Time slots tab): every time slot grouped by day,
// with booked / available / paused status, overlap warnings, and the
// "add a slot" form. /schedule/slots?student=<id> preselects that student.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { diffDays, fmtDate, todayISO } from '@/lib/dates'
import { ScheduleTabs } from '../tabs'
import { dayName, duration, fullName, hhmm, money } from '@/lib/format'
import { bookingSummary, currencySymbol, endTime, findOverlaps } from '@/lib/lessons'
import { distinctValues, instrumentSuggestions, studentOptions } from '@/lib/queries'
import { Badge, Card, EmptyState, PageHeader, Stat } from '@/components/ui'
import { SlotForm } from './slot-form'
import { createSlot } from './actions'

export const metadata: Metadata = { title: 'Time slots' }

export default async function SlotsPage({ searchParams }: PageProps<'/schedule/slots'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const t = teacher.id
  const preselect = typeof sp.student === 'string' && /^[0-9a-f-]{36}$/i.test(sp.student) ? sp.student : null
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
    distinctValues(t, 'time_slots', 'location'),
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
        title="Time slots"
        subtitle="Your weekly timetable. Book a pupil into a slot for a set stretch (e.g. a half term) and their lessons are added to the schedule."
      />
      <ScheduleTabs current="slots" />

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

      <div className="split">
        {/* ---- Timetable, grouped by day ---- */}
        <div className="stack">
          {slots.length === 0 ? (
            <Card>
              <EmptyState title="No time slots yet">Add your regular weekly teaching times using the form — you can book students into them now or later.</EmptyState>
            </Card>
          ) : (
            [1, 2, 3, 4, 5, 6, 7].map((day) => {
              const daySlots = slots.filter((s) => s.day_of_week === day)
              if (daySlots.length === 0) return null
              return (
                <Card key={day} title={dayName(day)}>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Student</th>
                          <th>Details</th>
                          <th className="right">Price</th>
                          <th>Status</th>
                          <th>
                            <span className="sr-only">Edit</span>
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
                              <td className="right nowrap">{money(s.price, teacher.currency)}</td>
                              <td>
                                {!s.active ? (
                                  <Badge>Paused</Badge>
                                ) : (
                                  {
                                    free: <Badge tone="sky">Free</Badge>,
                                    booked: <Badge tone="teal">Booked</Badge>,
                                    ending: <Badge tone="butter">Ends {fmtDate(s.ends_on, 'd MMM')}</Badge>,
                                    ended: <Badge tone="coral">Booking ended</Badge>,
                                    open: <Badge tone="coral">Set an end date</Badge>,
                                  }[bookingState(s)]
                                )}
                              </td>
                              <td className="right">
                                <Link className="btn btn-ghost btn-sm" href={`/schedule/slots/${s.id}`}>
                                  Edit
                                </Link>
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

        {/* ---- Add a slot ---- */}
        <Card title={preStudent ? `Book a slot for ${fullName(preStudent)}` : 'Add a slot'} id="add">
          {preStudent && <p className="small muted">Pick the day and time — {preStudent.first_name} is already chosen below.</p>}
          <SlotForm
            action={createSlot}
            students={students}
            studentId={preStudent?.id ?? null}
            defaultInstrument={preStudent?.instruments[0] ?? ''}
            instrumentSuggestions={instruments}
            locationSuggestions={locations}
            currencySymbol={currencySymbol(teacher.currency)}
          />
        </Card>
      </div>
    </>
  )
}
