'use client'
// =============================================================================
// messages/email/compose-form.tsx — write an email, check who gets it, then send
//
// Step 1 "Check who'll receive it" asks the server for the recipient list.
// Step 2 "Send to N people" only appears once the list has been checked and
// nothing has changed since — and still asks "are you sure?" before sending.
// Submits via startTransition (like ActionForm) so typed text is never wiped
// by React's automatic form reset; the form is cleared only after a send.
// =============================================================================
import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { Picker, type PickerOption } from '@/components/pickers'
import { Segmented, TextArea, TextField } from '@/components/ui'
import { composeEmail } from './actions'
import type { ComposeState } from './types'

export function ComposeForm(props: { students: PickerOption[]; preselect?: string; activeCount: number }) {
  const [state, formAction, pending] = useActionState(composeEmail, null)
  const [audience, setAudience] = useState(props.preselect ? 'choose' : 'all')
  // The state object the teacher last edited "on top of": if it equals the
  // current state, the checked list is out of date and Send is hidden.
  const [editedOn, setEditedOn] = useState<ComposeState | undefined>(undefined)
  const formRef = useRef<HTMLFormElement>(null)

  // Clear the message after a successful send
  useEffect(() => {
    if (state?.sent && !state.sent.error) formRef.current?.reset()
  }, [state])

  const preview = state?.preview
  const canSend = !!preview && preview.recipients.length > 0 && editedOn !== state
  const people = preview ? new Set(preview.recipients.map((r) => r.email.toLowerCase())).size : 0

  return (
    <form
      ref={formRef}
      className="form"
      onChange={(e) => {
        const t = e.target as EventTarget as HTMLInputElement
        if (t.name === 'audience') setAudience(t.value)
        setEditedOn(state)
      }}
      onSubmit={(e) => {
        e.preventDefault()
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        if (submitter?.value === 'send' && !window.confirm(`Send this email to ${people} ${people === 1 ? 'person' : 'people'} now?`)) return
        const fd = new FormData(e.currentTarget, submitter)
        startTransition(() => formAction(fd))
      }}
    >
      {/* ---- Errors / send result ---- */}
      {state?.error && (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      )}
      {state?.sent && (
        <div className={`alert ${state.sent.error ? 'alert-error' : 'alert-ok'}`} role="status">
          {state.sent.sent > 0 && `Sent to ${state.sent.sent} ${state.sent.sent === 1 ? 'person' : 'people'}. `}
          {state.sent.failed > 0 && `${state.sent.failed} couldn't be sent${state.sent.error ? `: ${state.sent.error}` : '.'}`}
          {state.sent.missing.length > 0 && (
            <div className="small" style={{ marginTop: 6 }}>
              Not reached (no email address): {state.sent.missing.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* ---- Audience ---- */}
      <Segmented
        label="Send to"
        name="audience"
        options={[
          { value: 'all', label: `All active students (${props.activeCount})` },
          { value: 'choose', label: 'Choose students' },
        ]}
        defaultValue={audience}
        hint="Under-18s: the email goes to their parents. 18 and over: it goes to the student."
      />
      <div style={{ display: audience === 'choose' ? 'block' : 'none' }}>
        <Picker name="student_ids" label="Students" options={props.students} defaultValue={props.preselect ? [props.preselect] : []} multiple />
      </div>

      {/* ---- Message ---- */}
      <TextField label="Subject" name="subject" placeholder="e.g. No lessons over half term" autoComplete="off" />
      <TextArea label="Message" name="body" rows={8} hint="Your name is added at the end automatically. Replies come straight to your own email." />

      {/* ---- Step 1: check recipients ---- */}
      <div className="form-actions">
        <button type="submit" name="intent" value="check" className={canSend ? 'btn btn-secondary' : 'btn'} disabled={pending}>
          {pending ? 'Working…' : preview && !canSend ? 'Check again' : 'Check who’ll receive it'}
        </button>
      </div>

      {/* ---- Step 2: review the list and send ---- */}
      {preview && (
        <div className="card" style={{ background: 'var(--teal-wash)', boxShadow: 'none', opacity: canSend || preview.recipients.length === 0 ? 1 : 0.6 }}>
          <h3 style={{ marginBottom: 8 }}>
            {preview.recipients.length === 0 ? 'Nobody to send to' : `${people} ${people === 1 ? 'person' : 'people'} will receive this`}
          </h3>
          {preview.recipients.length > 0 && (
            <ul className="list small" style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 12 }}>
              {preview.recipients.map((r) => (
                <li key={`${r.studentName}-${r.email}`} style={{ padding: '6px 0' }}>
                  <strong>{r.name}</strong> <span className="muted">&lt;{r.email}&gt;</span>
                  {r.via === 'guardian' && <span className="muted"> · for {r.studentName}</span>}
                </li>
              ))}
            </ul>
          )}
          {preview.missing.length > 0 && (
            <p className="small" style={{ color: 'var(--coral-ink)', fontWeight: 700 }}>
              No email address for: {preview.missing.join(', ')}. Add one on their student page (or link a parent) to include them.
            </p>
          )}
          {editedOn === state && <p className="small muted">You’ve changed something since checking — check again before sending.</p>}
          {canSend && (
            <button type="submit" name="intent" value="send" className="btn" disabled={pending}>
              {pending ? 'Sending…' : `Send to ${people} ${people === 1 ? 'person' : 'people'}`}
            </button>
          )}
        </div>
      )}
    </form>
  )
}
