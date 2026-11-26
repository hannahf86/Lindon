// =============================================================================
// components/event-fields.tsx — the fields for a calendar event: title, kind
// (pills), date, optional start/end times, location, notes. Shared by the
// calendar's "click a day" pop-up and the event page. Server-safe, no state.
// =============================================================================
import type { CalendarEvent } from '@/lib/database.types'
import { EVENT_KINDS } from '@/lib/events'
import { Segmented, TextArea, TextField } from '@/components/ui'

export function EventFields({ event, date, hideDate }: { event?: CalendarEvent; date?: string; hideDate?: boolean }) {
  return (
    <>
      <TextField label="Title" name="title" defaultValue={event?.title ?? ''} placeholder="e.g. Spring concert" required autoComplete="off" />
      <Segmented label="What kind of event?" name="kind" options={EVENT_KINDS} defaultValue={event?.kind ?? 'concert'} />
      <div className="form-grid">
        {hideDate ? (
          <input type="hidden" name="event_date" value={date ?? event?.event_date ?? ''} />
        ) : (
          <TextField label="Date" name="event_date" type="date" defaultValue={event?.event_date ?? date ?? ''} required wrapClass="full" />
        )}
        <TextField label="Starts" name="starts" defaultValue={event?.starts?.slice(0, 5) ?? ''} placeholder="e.g. 18:00" autoComplete="off" hint="Leave both times empty for all day." />
        <TextField label="Ends" name="ends" defaultValue={event?.ends?.slice(0, 5) ?? ''} placeholder="e.g. 20:00" autoComplete="off" />
        <TextField label="Location" name="location" defaultValue={event?.location ?? ''} placeholder="e.g. St Olave’s Church" wrapClass="full" />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={event?.notes ?? ''} rows={3} style={{ minHeight: 70 }} placeholder="Anything to remember — what to bring, who’s playing…" />
    </>
  )
}
