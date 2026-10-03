// =============================================================================
// schedule/slots/slot-form.tsx — the add / edit time slot form
// Day is a row of pills; start time, length and price are typed ("4:30pm" or
// "16:30" both work). The student is chosen from a Picker, or left as
// "Unbooked / available".
// =============================================================================
import Link from 'next/link'
import type { TimeSlot } from '@/lib/database.types'
import type { ActionState } from '@/lib/forms'
import { DAY_SHORT, hhmm } from '@/lib/format'
import { fmtDate } from '@/lib/dates'
import { REPEAT_OPTIONS } from '@/lib/lessons'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Picker, type PickerOption } from '@/components/pickers'
import { MoneyField, Segmented, TextArea, TextField, Toggle } from '@/components/ui'
import { SuggestField } from '@/components/pickers'

export function SlotForm(props: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>
  slot?: TimeSlot
  students: PickerOption[]
  /** Preselected student (from ?student=) when adding */
  studentId?: string | null
  defaultInstrument?: string
  instrumentSuggestions: string[]
  locationSuggestions: string[]
  currencySymbol: string
  /** Edit only: how many upcoming scheduled lessons were made from this slot */
  upcomingLessons?: number
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
      {/* ---- When ---- */}
      <Segmented
        label="Day"
        name="day_of_week"
        options={DAY_SHORT.map((d, i) => ({ value: String(i + 1), label: d }))}
        defaultValue={String(s?.day_of_week ?? 1)}
      />
      <div className="form-grid">
        <TextField
          label="Start time"
          name="start_time"
          defaultValue={s ? hhmm(s.start_time) : ''}
          placeholder="e.g. 16:30 or 4:30pm"
          required
          autoComplete="off"
        />
        <TextField
          label="Length (minutes)"
          name="duration_minutes"
          inputMode="numeric"
          defaultValue={String(s?.duration_minutes ?? 30)}
          placeholder="e.g. 30"
          required
          autoComplete="off"
        />
        <MoneyField
          label="Price per lesson"
          name="price"
          symbol={props.currencySymbol}
          defaultValue={s ? Number(s.price).toFixed(2) : ''}
          placeholder="0.00"
        />
        <TextField label="Label" name="label" defaultValue={s?.label} placeholder="e.g. After school, Lunchtime" hint="Optional" />
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
          Lessons are added to the schedule for these dates only — book a half term at a time, then extend it.
        </p>
        <div className="form-grid">
          <TextField label="First lesson" name="starts_on" type="date" defaultValue={s?.starts_on ?? props.defaultStartsOn ?? ''} hint="Leave blank for the next one." />
          <Segmented label="How often" name="repeat_weeks" options={REPEAT_OPTIONS} defaultValue={String(s?.repeat_weeks ?? 1)} />
          <TextField label="Last lesson" name="ends_on" type="date" defaultValue={s?.ends_on ?? ''} hint="Pick from the calendar…" />
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
        <SuggestField
          name="location"
          label="Location"
          defaultValue={s?.location ?? ''}
          suggestions={props.locationSuggestions}
          placeholder="e.g. Home studio, St Peter's School"
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
