// =============================================================================
// events/[id]/page.tsx — one calendar event: edit it or delete it
// (events are added from the calendar's "click a day" pop-up)
// =============================================================================
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db, requireTeacher } from '@/lib/db'
import { fmtDate } from '@/lib/dates'
import { eventKindLabel, eventTimeLabel } from '@/lib/events'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Card, PageHeader } from '@/components/ui'
import { EventFields } from '@/components/event-fields'
import { studentOptions } from '@/lib/queries'
import { eventReplies } from '@/lib/event-sharing'
import { has } from '@/lib/features'
import { deleteEvent, updateEvent } from '../actions'

export const metadata: Metadata = { title: 'Event' }

export default async function EventPage({ params }: PageProps<'/events/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const teacher = await requireTeacher()
  const { data: event } = await db().from('events').select('*').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
  if (!event) notFound()
  const [students, replies] = await Promise.all([studentOptions(teacher.id), event.shared ? eventReplies(event) : Promise.resolve(null)])

  return (
    <>
      <PageHeader
        title={event.title}
        subtitle={`${eventKindLabel(event.kind)} · ${fmtDate(event.event_date, 'EEEE d MMMM yyyy')} · ${eventTimeLabel(event)}`}
        back={{ href: `/schedule?view=day&date=${event.event_date}`, label: 'Back to that day' }}
      />

      {/* ---- Edit ---- */}
      <Card title="Event details">
        <ActionForm action={updateEvent.bind(null, event.id)}>
          <EventFields event={event} students={students} familiesOn={has(teacher, 'family_logins')} />
          <div className="form-actions">
            <SubmitButton>Save event</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {/* ---- Who's coming (shared with families) ---- */}
      {replies && (
        <div style={{ marginTop: 20 }}>
          <Card title="Who’s coming" actions={<span className="small muted">{replies.coming.length} coming · {replies.notComing.length} can’t · {replies.waiting.length} no reply</span>}>
            <div className="grid grid-3">
              <div>
                <h3 style={{ marginBottom: 6 }}>Coming ({replies.coming.length})</h3>
                <ul className="list small">
                  {replies.coming.map((r) => (
                    <li key={r.id}>
                      <strong>{r.name}</strong>
                      {r.reply?.note && <div className="muted">“{r.reply.note}”</div>}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 style={{ marginBottom: 6 }}>Can’t make it ({replies.notComing.length})</h3>
                <ul className="list small">
                  {replies.notComing.map((r) => (
                    <li key={r.id}>
                      <strong>{r.name}</strong>
                      {r.reply?.note && <div className="muted">“{r.reply.note}”</div>}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 style={{ marginBottom: 6 }}>No reply yet ({replies.waiting.length})</h3>
                <ul className="list small">
                  {replies.waiting.map((r) => (
                    <li key={r.id}>{r.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ---- Delete ---- */}
      <div style={{ marginTop: 20 }}>
        <ConfirmButton action={deleteEvent.bind(null, event.id)} confirm={`Delete “${event.title}”? This can’t be undone.`}>
          Delete event
        </ConfirmButton>
      </div>
    </>
  )
}
