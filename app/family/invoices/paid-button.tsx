// =============================================================================
// family/invoices/paid-button.tsx — the family's "I've paid" button
//
// Opens a small pop-up with an optional note ("Bank transfer on 2 Dec"),
// then tells the teacher. Once told, shows "You said you've paid — waiting
// for {teacher} to confirm" instead. Server component; the pop-up is the
// shared ModalButton.
// =============================================================================
import { fmtDate } from '@/lib/dates'
import { ModalButton } from '@/components/modal'
import { ActionForm, SubmitButton } from '@/components/forms'
import { familySaysPaid } from './actions'

export function PaidButton(props: { invoiceId: string; number: string; amount: string; status: string; familyPaidAt: string | null; teacherName: string; size?: 'sm' }) {
  if (props.status !== 'sent') return null
  if (props.familyPaidAt) {
    return (
      <span className="small" style={{ color: 'var(--teal-deep)', fontWeight: 800 }}>
        ✓ You said you paid on {fmtDate(props.familyPaidAt.slice(0, 10), 'd MMM')} — waiting for {props.teacherName} to confirm
      </span>
    )
  }
  return (
    <ModalButton label="I’ve paid" title={`Paid invoice ${props.number}?`} className={`btn${props.size === 'sm' ? ' btn-sm' : ''}`}>
      <ActionForm action={familySaysPaid.bind(null, props.invoiceId)}>
        <p style={{ margin: 0 }}>
          We’ll let {props.teacherName} know you’ve paid <strong>{props.amount}</strong>. They’ll mark it as paid once it’s arrived.
        </p>
        <div className="field">
          <label className="field-label" htmlFor={`paid-note-${props.invoiceId}`}>
            How and when did you pay? (optional)
          </label>
          <input id={`paid-note-${props.invoiceId}`} name="note" className="input" maxLength={500} placeholder="e.g. Bank transfer on 2 December" />
        </div>
        <div className="form-actions">
          <SubmitButton pendingText="Sending…">Yes, I’ve paid</SubmitButton>
        </div>
      </ActionForm>
    </ModalButton>
  )
}
