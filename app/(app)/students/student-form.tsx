// =============================================================================
// students/student-form.tsx — the add / edit student form
// Instruments and level are free text (typed by the teacher, no dropdowns).
// =============================================================================
import Link from 'next/link'
import type { Student } from '@/lib/database.types'
import type { ActionState } from '@/lib/forms'
import { ActionForm, SubmitButton } from '@/components/forms'
import { TagInput } from '@/components/pickers'
import { Card, Segmented, SlidePill, TextArea, TextField, Toggle } from '@/components/ui'

export function StudentForm(props: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>
  student?: Student
  instrumentSuggestions: string[]
  cancelHref: string
}) {
  const s = props.student
  return (
    <ActionForm action={props.action}>
      {/* ---- About the student ---- */}
      <Card title="About">
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
          <Segmented label="Status" name="status" options={['active', 'paused', 'left']} defaultValue={s?.status ?? 'active'} className="full" />
        </div>
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

      {/* ---- Children: point to parents instead ---- */}
      <div className="alert alert-info child-only">
        Children are contacted through their parents or guardians — you can add them on the next page after saving.
      </div>

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
