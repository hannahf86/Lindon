// =============================================================================
// contacts/guardian-form.tsx — the add / edit parent-or-guardian form
// When adding, the teacher can also tick which students this person is for.
// =============================================================================
import Link from 'next/link'
import type { Guardian } from '@/lib/database.types'
import type { ActionState } from '@/lib/forms'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Picker, type PickerOption } from '@/components/pickers'
import { Card, TextArea, TextField, Toggle } from '@/components/ui'

export function GuardianForm(props: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>
  guardian?: Guardian
  /** Only on "add": students to link straight away */
  students?: PickerOption[]
  preselect?: string[]
  cancelHref: string
}) {
  const g = props.guardian
  return (
    <ActionForm action={props.action}>
      {/* ---- Who they are ---- */}
      <Card title="Contact details">
        <div className="form-grid">
          <TextField label="First name" name="first_name" defaultValue={g?.first_name} required autoFocus={!g} />
          <TextField label="Last name" name="last_name" defaultValue={g?.last_name} />
          <TextField label="Email" name="email" type="email" defaultValue={g?.email} autoComplete="off" hint="Reminders, invoices and messages go here." />
          <TextField label="Phone" name="phone" type="tel" defaultValue={g?.phone} autoComplete="off" />
          <TextArea label="Address" name="address" defaultValue={g?.address} wrapClass="full" rows={3} style={{ minHeight: 80 }} hint="Optional — handy for invoices." />
          <TextArea label="Private notes" name="notes" defaultValue={g?.notes} wrapClass="full" hint="Only you can see these." />
        </div>
      </Card>

      {/* ---- Link to students (add only) ---- */}
      {props.students && (
        <Card title="Who are they a parent or guardian of?">
          {props.students.length === 0 ? (
            <p className="muted">
              You haven&apos;t added any students yet. You can link this contact later from their page or the student&apos;s page.
            </p>
          ) : (
            <div className="form">
              <Picker
                name="student_ids"
                label="Students"
                options={props.students}
                defaultValue={props.preselect}
                multiple
                hint="Tick every child they look after — siblings can share the same contact."
              />
              <div className="form-grid">
                <TextField label="Relationship" name="relationship" placeholder="e.g. Mum, Dad, Grandparent, Carer" />
                <Toggle name="is_primary" label="Main contact" defaultChecked />
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="form-actions">
        <SubmitButton>{g ? 'Save changes' : 'Add contact'}</SubmitButton>
        <Link href={props.cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </ActionForm>
  )
}
