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
import { deleteEvent, updateEvent } from '../actions'

export const metadata: Metadata = { title: 'Event' }

export default async function EventPage({ params }: PageProps<'/events/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const teacher = await requireTeacher()
  const { data: event } = await db().from('events').select('*').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
  if (!event) notFound()

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
          <EventFields event={event} />
          <div className="form-actions">
            <SubmitButton>Save event</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {/* ---- Delete ---- */}
      <div style={{ marginTop: 20 }}>
        <ConfirmButton action={deleteEvent.bind(null, event.id)} confirm={`Delete “${event.title}”? This can’t be undone.`}>
          Delete event
        </ConfirmButton>
      </div>
    </>
  )
}
