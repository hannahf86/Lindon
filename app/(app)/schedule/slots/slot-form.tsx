// =============================================================================
// schedule/slots/slot-form.tsx — the add / edit time slot form
// Day is a row of pills; start time (15-minute steps) and length are
// dropdowns; price is typed. The student is chosen from a Picker, or left as
// "Unbooked / available". Location is a dropdown of the teacher's saved
// locations, with "add a new location" (components/location-select.tsx).
// =============================================================================
import Link from 'next/link'
import type { TimeSlot } from '@/lib/database.types'
import type { ActionState } from '@/lib/forms'
import { DAY_SHORT, hhmm } from '@/lib/format'
import { fmtDate } from '@/lib/dates'
import { lengthOptions, repeatOptions } from '@/lib/lessons'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Picker, type PickerOption } from '@/components/pickers'
import { MoneyField, Segmented, SelectField, TextArea, TextField, Toggle } from '@/components/ui'
import { TimeField } from '@/components/time-field'
import { SuggestField } from '@/components/pickers'
import { LocationSelect } from '@/components/location-select'

export function SlotForm(props: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>
  slot?: TimeSlot
  students: PickerOption[]
  /** Preselected student (from ?student=) when adding */
  studentId?: string | null
  defaultInstrument?: string
  instrumentSuggestions: string[]
  /** The teacher's saved locations */
  locations: string[]
  currencySymbol: string
  /** Edit only: how many upcoming scheduled lessons were made from this slot */
  upcomingLessons?: number
  /** Day pill to start on when adding (1 = Monday … 7 = Sunday) */
  defaultDay?: number
  /** Suggested first lesson date for a new booking (next matching day) */
  defaultStartsOn?: string
  cancelHref?: string
  /** Pupil page to return to after saving (edit started there) */
  returnTo?: string
}) {
  const s = props.slot
  return (
    <ActionForm action={props.action}>
      {props.returnTo && <input type="hidden" name="return_to" value={props.returnTo} />}
      {/* Older slots may have a label (the field was replaced by Location) — keep it */}
      <input type="hidden" name="label" value={s?.label ?? ''} />
      {/* ---- When ---- */}
      <Segmented
        label="Day"
        name="day_of_week"
        options={DAY_SHORT.map((d, i) => ({ value: String(i + 1), label: d }))}
        defaultValue={String(s?.day_of_week ?? props.defaultDay ?? 1)}
      />
      <div className="form-grid">
        <TimeField label="Start time" name="start_time" defaultValue={s ? hhmm(s.start_time) : ''} required />
        <SelectField
          label="Lesson length"
          name="duration_minutes"
          options={lengthOptions(s?.duration_minutes)}
          defaultValue={String(s?.duration_minutes ?? 30)}
        />
        <MoneyField
          label="Price per lesson"
          name="price"
          symbol={props.currencySymbol}
          defaultValue={s ? Number(s.price).toFixed(2) : ''}
          placeholder="0.00"
        />
        <LocationSelect locations={props.locations} defaultValue={s?.location ?? ''} />
      </div>

      {/* ---- Who ---- */}
      <Picker
        name="student_id"
        label="Student"
        options={props.students}
        defaultValue={s ? s.student_id : (props.studentId ?? null)}
        allowNone="Unbooked / available"
      />

      {/* ---- Booking: only shown while a pupil is chosen (CSS in globals: .booking-only) ---- */}
      <div className="booking-only form-section">
        <h3 style={{ marginBottom: 4 }}>Booking</h3>
        <p className="small muted" style={{ margin: '0 0 12px' }}>
          Leave “Last lesson” empty for lessons that keep going until you end the booking, or set an end date (e.g. the end of term).
        </p>
        <div className="form-grid">
          <TextField label="First lesson" name="starts_on" type="date" defaultValue={s?.starts_on ?? props.defaultStartsOn ?? ''} hint="Leave blank for the next one." />
          <Segmented label="How often" name="repeat_weeks" options={repeatOptions(s?.repeat_weeks)} defaultValue={String(s?.repeat_weeks ?? 1)} />
          <TextField label="Last lesson" name="ends_on" type="date" defaultValue={s?.ends_on ?? ''} hint="Optional — empty means no end date." />
          <TextField label="…or number of lessons" name="lesson_count" inputMode="numeric" placeholder="e.g. 6" hint="Fills in the last lesson date for you." />
          <TextField
            label="Weeks off (no lesson)"
            name="skip_dates"
            defaultValue={(s?.skip_dates ?? []).map((d) => fmtDate(d, 'dd/MM/yyyy')).join(', ')}
            placeholder="e.g. 27/10/2026, or 22/12/2026 - 2/1/2027"
            hint="Optional — dates inside the booking with no lesson."
            wrapClass="full"
          />
        </div>
      </div>

      {/* ---- What & where ---- */}
      <div className="form-grid">
        <SuggestField
          name="instrument"
          label="Instrument"
          defaultValue={s?.instrument ?? props.defaultInstrument ?? ''}
          suggestions={props.instrumentSuggestions}
          placeholder="e.g. Piano"
        />
        <TextArea label="Notes" name="notes" defaultValue={s?.notes} wrapClass="full" rows={3} style={{ minHeight: 70 }} hint="Only you can see these." />
      </div>
      <Toggle name="active" label="Slot is running" defaultChecked={s?.active ?? true} hint="Switch off to pause this slot without deleting it (e.g. over the summer)." />

      {/* ---- Carry changes onto upcoming lessons (edit only) ---- */}
      {s && (props.upcomingLessons ?? 0) > 0 && (
        <div className="form-section">
          {/* Tells the action the teacher saw (and may have unticked) this choice */}
          <input type="hidden" name="update_lessons_shown" value="1" />
          <Toggle
            name="update_lessons"
            label="Also update upcoming lessons from this slot"
            defaultChecked
            hint={`${props.upcomingLessons} upcoming scheduled lesson${props.upcomingLessons === 1 ? '' : 's'} came from this slot. Their day, time, length, price, instrument, location and student will be updated to match. If you make the slot available (no student), those upcoming lessons are removed. Completed and cancelled lessons are never changed.`}
          />
        </div>
      )}

      <div className="form-actions">
        <SubmitButton>{s ? 'Save changes' : 'Add slot'}</SubmitButton>
        {props.cancelHref && (
          <Link href={props.cancelHref} className="btn btn-ghost">
            Cancel
          </Link>
        )}
      </div>
    </ActionForm>
  )
}
