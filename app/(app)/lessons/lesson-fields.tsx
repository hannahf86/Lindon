// =============================================================================
// lessons/lesson-fields.tsx — the lesson detail fields shared by the
// "one-off lesson" form and the lesson page's edit form: date, typed start
// time, length in minutes, price, instrument and location. Status and
// "chargeable" are only shown when editing an existing lesson.
// =============================================================================
import type { Lesson } from '@/lib/database.types'
import { utcToZonedParts } from '@/lib/dates'
import { MoneyField, Segmented, TextField, Toggle } from '@/components/ui'
import { ATTENDANCE_OPTIONS } from '@/lib/lessons'
import { SuggestField } from '@/components/pickers'

export type LessonDefaults = { date?: string; time?: string; duration_minutes?: number; price?: number; instrument?: string; location?: string }

export function LessonFields(props: {
  lesson?: Lesson
  timeZone: string
  defaults?: LessonDefaults
  currencySymbol: string
  instrumentSuggestions: string[]
  locationSuggestions: string[]
}) {
  const l = props.lesson
  const d = props.defaults ?? {}
  const local = l ? utcToZonedParts(l.starts_at, props.timeZone) : null

  return (
    <>
      {/* ---- When ---- */}
      <div className="form-grid">
        <TextField label="Date" name="date" type="date" defaultValue={local?.date ?? d.date ?? ''} required />
        <TextField label="Start time" name="time" defaultValue={local?.time ?? d.time ?? ''} placeholder="e.g. 16:30 or 4:30pm" required autoComplete="off" />
        <TextField
          label="Length (minutes)"
          name="duration_minutes"
          inputMode="numeric"
          defaultValue={String(l?.duration_minutes ?? d.duration_minutes ?? 30)}
          required
          autoComplete="off"
        />
        <MoneyField
          label="Price"
          name="price"
          symbol={props.currencySymbol}
          defaultValue={l ? Number(l.price).toFixed(2) : d.price !== undefined ? Number(d.price).toFixed(2) : ''}
          placeholder="0.00"
        />

        {/* ---- What & where ---- */}
        <SuggestField name="instrument" label="Instrument" defaultValue={l?.instrument ?? d.instrument ?? ''} suggestions={props.instrumentSuggestions} placeholder="e.g. Piano" />
        <SuggestField name="location" label="Location" defaultValue={l?.location ?? d.location ?? ''} suggestions={props.locationSuggestions} placeholder="e.g. Home studio" />
      </div>

      {/* ---- Status (edit only) ---- */}
      {l && (
        <>
          <Segmented label="Attendance" name="status" options={ATTENDANCE_OPTIONS} defaultValue={l.status} hint="Notice given and teacher cancelled each add a make-up credit, which comes off the next invoice automatically." />
          <Toggle
            name="chargeable"
            label="Chargeable"
            defaultChecked={l.chargeable}
            hint="Switch off if you won't bill for this lesson. Leave on for late cancellations you still charge for."
          />
        </>
      )}
    </>
  )
}
