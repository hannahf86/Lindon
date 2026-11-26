// =============================================================================
// students/student-form.tsx — the add / edit student form
// Instruments and level are free text (typed by the teacher, no dropdowns).
// Children: their parents or guardians are on the same form, both when adding
// and editing (the card disappears when "Adult" is picked). Editing shows each
// linked parent's details plus an optional "add another parent".
// Their regular lesson (day, time, length, price…) is on the form too: when
// adding, or when editing someone with no booking yet. Editing someone who is
// already booked lists their lesson(s) with a link to change them.
// Status sits in the top-right corner of the About card.
// =============================================================================
import Link from 'next/link'
import type { Student } from '@/lib/database.types'
import type { ActionState } from '@/lib/forms'
import { ActionForm, SubmitButton } from '@/components/forms'
import { TagInput } from '@/components/pickers'
import { Card, Segmented, SlidePill, TextArea, TextField, Toggle } from '@/components/ui'
import { RegularLessonFields } from '@/components/regular-lesson-fields'

export function StudentForm(props: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>
  student?: Student
  instrumentSuggestions: string[]
  cancelHref: string
  /** Parents already linked (editing a child) */
  parents?: ParentRow[]
  /** For the regular lesson fields */
  lesson: { currencySymbol: string; today: string; locations: string[] }
  /** Editing: their current regular lessons (empty = show the fields to book one) */
  bookings?: { id: string; summary: string }[]
}) {
  const s = props.student
  const parents = props.parents ?? []
  return (
    <ActionForm action={props.action}>
      {/* ---- About the student ---- */}
      <Card
        title="About"
        actions={
          <div className="card-status">
            <Segmented label="Status" name="status" options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'left', label: 'Past' }]} defaultValue={s?.status ?? 'active'} />
          </div>
        }
      >
        <div className="form-grid">
          <TextField label="First name" name="first_name" defaultValue={s?.first_name} required autoFocus={!s} />
          <TextField label="Last name" name="last_name" defaultValue={s?.last_name} />
          <SlidePill
            label="Pupil type"
            name="age_group"
            options={[
              { value: 'minor', label: 'Child' },
              { value: 'adult', label: 'Adult' },
            ]}
            defaultValue={s && !s.is_minor ? 'adult' : 'minor'}
            hint="Children (under 18) are contacted through their parents. If you add a date of birth, it sets this for you."
          />
          <TextField label="Date of birth" name="date_of_birth" type="date" defaultValue={s?.date_of_birth ?? ''} hint="Optional" />
          <div className="full">
            <TagInput
              name="instruments"
              label="Instruments"
              defaultValue={s?.instruments}
              suggestions={props.instrumentSuggestions}
              placeholder="e.g. Piano — press Enter to add another"
            />
          </div>
          <TextField label="Level" name="level" defaultValue={s?.level} placeholder="e.g. Grade 3, Beginner, Diploma prep" />
          <TextField label="Started lessons" name="start_date" type="date" defaultValue={s?.start_date ?? ''} />
        </div>
      </Card>

      {/* ---- Their regular lesson ---- */}
      <Card title={s ? 'Regular lesson' : 'Their regular lesson'}>
        {props.bookings && props.bookings.length > 0 ? (
          <ul className="list">
            {props.bookings.map((b) => (
              <li key={b.id} className="spread">
                <span>{b.summary}</span>
                <Link href={`/schedule/slots/${b.id}?from=/students/${s!.id}`} className="btn btn-ghost btn-sm">
                  Change
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="form">
            <p className="muted small" style={{ margin: 0 }}>
              Pick the day, time and length. Leave the time on “Not yet” to book it later from Schedule.
            </p>
            <RegularLessonFields currencySymbol={props.lesson.currencySymbol} today={props.lesson.today} locations={props.lesson.locations} />
          </div>
        )}
      </Card>

      {/* ---- Contact: adults only (hidden by CSS while "Child" is selected) ---- */}
      <Card title="Contact details" className="adult-only">
        <p className="muted small">Adult pupils are emailed directly, so reminders, notes and invoices go here.</p>
        <div className="form-grid">
          <TextField label="Email" name="email" type="email" defaultValue={s?.email} autoComplete="off" />
          <TextField label="Phone" name="phone" type="tel" defaultValue={s?.phone} autoComplete="off" />
          <TextArea label="Address" name="address" defaultValue={s?.address} wrapClass="full" rows={3} style={{ minHeight: 80 }} />
        </div>
      </Card>

      {/* ---- Children: parents or guardians (hidden by CSS while "Adult" is selected) ---- */}
      <Card title={parents.length > 1 ? 'Parents or guardians' : 'Parent or guardian'} className="child-only">
        <p className="muted small">
          Reminders and invoices for children go to them.
          {parents.length > 0 && ' Changes to a parent apply to all their children. To unlink one, use the parent’s pop-up on the student’s page.'}
        </p>
        {parents.map((g, i) => (
          <fieldset key={g.guardian_id} className="parent-set">
            <legend className="field-label">{i === 0 ? 'Main contact' : `Parent ${i + 1}`}</legend>
            <input type="hidden" name={`parent_${i}_id`} value={g.guardian_id} />
            <ParentFields i={i} g={g} />
          </fieldset>
        ))}
        {/* A blank set: required when adding a child, optional "add another" when editing */}
        <fieldset className="parent-set">
          {parents.length > 0 && <legend className="field-label">Add another parent (optional)</legend>}
          <ParentFields i={parents.length} />
        </fieldset>
      </Card>

      {/* ---- Preferences & notes ---- */}
      <Card title="Notes & preferences">
        <div className="form">
          <Toggle name="reminders_enabled" label="Send lesson reminder emails" defaultChecked={s?.reminders_enabled ?? true} />
          <TextArea label="Private notes" name="notes" defaultValue={s?.notes} hint="Only you can see these." />
        </div>
      </Card>

      <div className="form-actions">
        <SubmitButton>{s ? 'Save changes' : 'Add student'}</SubmitButton>
        <Link href={props.cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </ActionForm>
  )
}

// ---- One parent's fields (numbered so several can sit in one form) ----------------------
export type ParentRow = { guardian_id: string; first_name: string; last_name: string; email: string; phone: string; relationship: string }

function ParentFields({ i, g }: { i: number; g?: ParentRow }) {
  const n = (f: string) => `parent_${i}_${f}`
  return (
    <div className="form-grid">
      <TextField label="First name" name={n('first_name')} id={n('first_name')} defaultValue={g?.first_name} autoComplete="off" />
      <TextField label="Last name" name={n('last_name')} id={n('last_name')} defaultValue={g?.last_name} autoComplete="off" />
      <TextField
        label="Email"
        name={n('email')}
        id={n('email')}
        type="email"
        defaultValue={g?.email}
        autoComplete="off"
        hint={g ? undefined : 'If this parent is already on file (a brother or sister), they’re linked rather than added twice.'}
      />
      <TextField label="Phone" name={n('phone')} id={n('phone')} type="tel" defaultValue={g?.phone} autoComplete="off" />
      <TextField label="Relationship" name={n('relationship')} id={n('relationship')} defaultValue={g?.relationship} placeholder="e.g. Mum, Dad, Grandparent" autoComplete="off" wrapClass="full" hint="Optional" />
    </div>
  )
}
