// =============================================================================
// components/regular-lesson-fields.tsx — a pupil's regular lesson: day, time
// (15-minute steps, "Not yet" = book later), length, price, location, first
// lesson, how often, and when it ends. Shared by onboarding step 5 and the
// student add / edit form; read back with lib/regular-lesson.ts.
// Server-safe; the "Last lesson" date only shows while "On a date" is picked
// (CSS .ends-date-only).
// =============================================================================
import { DAY_SHORT } from '@/lib/format'
import { lengthOptions, REPEAT_OPTIONS } from '@/lib/lessons'
import { MoneyField, Segmented, SelectField, SlidePill, TextField } from '@/components/ui'
import { TimeField } from '@/components/time-field'
import { LocationSelect } from '@/components/location-select'

export function RegularLessonFields(props: { currencySymbol: string; today: string; locations: string[] }) {
  return (
    <>
      <Segmented label="Day" name="lesson_day" options={DAY_SHORT.map((d, i) => ({ value: String(i + 1), label: d }))} defaultValue="6" />
      <div className="form-grid">
        <TimeField label="Time" name="lesson_time" emptyLabel="Not yet" />
        <SelectField label="Lesson length" name="duration_minutes" options={lengthOptions()} defaultValue="30" />
        <MoneyField label="Price per lesson" name="price" symbol={props.currencySymbol} placeholder="0.00" />
        <LocationSelect name="lesson_location" locations={props.locations} />
        <TextField label="First lesson" name="first_lesson" type="date" defaultValue={props.today} hint="Moves to the next lesson day if needed." wrapClass="full" />
      </div>
      <Segmented label="How often" name="repeat_weeks" options={REPEAT_OPTIONS} defaultValue="1" />
      <SlidePill
        label="Ends"
        name="ends"
        options={[
          { value: 'never', label: 'Keeps going' },
          { value: 'date', label: 'On a date' },
        ]}
        defaultValue="never"
      />
      <div className="ends-date-only">
        <TextField label="Last lesson" name="ends_on" type="date" />
      </div>
    </>
  )
}
