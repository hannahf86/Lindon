// =============================================================================
// components/event-fields.tsx — the fields for a calendar event: title, kind
// (pills), date, optional start/end times, location, notes, and whether to
// show it to families and ask who's coming (everyone or chosen pupils; CSS
// shows the extra fields only when switched on). Shared by the calendar's
// "click a day" pop-up and the event page. Server-safe, no state.
// =============================================================================
import type { CalendarEvent } from '@/lib/database.types'
import { EVENT_KINDS } from '@/lib/events'
import { Segmented, TextArea, TextField, Toggle } from '@/components/ui'
import { Picker, type PickerOption } from '@/components/pickers'
import { TimeField } from '@/components/time-field'

export function EventFields({ event, date, hideDate, students = [], familiesOn = true }: { event?: CalendarEvent; date?: string; hideDate?: boolean; students?: PickerOption[]; familiesOn?: boolean }) {
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
        <TimeField label="Starts" name="starts" defaultValue={event?.starts} emptyLabel="All day" hint="Leave on “All day” for no times." />
        <TimeField label="Ends" name="ends" defaultValue={event?.ends} emptyLabel="No end time" />
        <TextField label="Location" name="location" defaultValue={event?.location ?? ''} placeholder="e.g. St Olave’s Church" wrapClass="full" />
      </div>
      <TextArea label="Notes" name="notes" defaultValue={event?.notes ?? ''} rows={3} style={{ minHeight: 70 }} placeholder="Anything to remember — what to bring, who’s playing…" />

      {/* ---- Families: show it and ask who's coming ---- */}
      {familiesOn && (
        <div className="event-share">
          <Toggle name="shared" label="Show to families and ask who’s coming" defaultChecked={event?.shared ?? false} hint="Families see it under Events and tap “Coming” or “Can’t make it” for each child." />
          <div className="share-only">
            <Segmented
              label="Who’s it for?"
              name="share_who"
              options={[
                { value: 'everyone', label: 'Everyone' },
                { value: 'some', label: 'Choose pupils' },
              ]}
              defaultValue={event && !event.everyone ? 'some' : 'everyone'}
            />
            <div className="share-some-only">
              <Picker name="share_students" label="Pupils" options={students} defaultValue={event?.student_ids ?? []} multiple placeholder="Type a name…" />
            </div>
            <Toggle name="notify" label="Message the families now" defaultChecked={!event?.shared} hint="An in-app message (with an email alert) asking them to reply." />
          </div>
        </div>
      )}
    </>
  )
}
