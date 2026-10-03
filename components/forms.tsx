'use client'
// =============================================================================
// components/forms.tsx — interactive form pieces (client components)
//
// ActionForm   — wraps a server action with useActionState; shows errors/success
// SubmitButton — disables itself while the form is submitting
// ConfirmButton— a one-button form that asks "are you sure?" first (deletes etc.)
// =============================================================================
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import type { ActionState } from '@/lib/forms'

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>

// ---- ActionForm --------------------------------------------------------------------
// Submits via startTransition rather than <form action>, because React 19
// auto-resets a form after an action — which would wipe what the teacher
// typed whenever validation fails. We reset manually only on success.
const PendingContext = createContext(false)

export function ActionForm(props: {
  action: FormAction
  children: ReactNode
  className?: string
  /** Clear the form after a successful submit (e.g. "add another" forms) */
  resetOnSuccess?: boolean
}) {
  const [state, formAction, pending] = useActionState(props.action, null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (props.resetOnSuccess && state?.ok) formRef.current?.reset()
  }, [state, props.resetOnSuccess])

  return (
    <form
      ref={formRef}
      className={props.className ?? 'form'}
      onSubmit={(e) => {
        e.preventDefault()
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null
        const fd = new FormData(e.currentTarget, submitter)
        startTransition(() => formAction(fd))
      }}
    >
      {state?.error && (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="alert alert-ok" role="status">
          {state.ok}
        </div>
      )}
      <PendingContext.Provider value={pending}>{props.children}</PendingContext.Provider>
    </form>
  )
}

// ---- SubmitButton ----------------------------------------------------------------------
export function SubmitButton(props: { children: ReactNode; className?: string; pendingText?: string; name?: string; value?: string }) {
  const ctxPending = useContext(PendingContext)
  const { pending: formPending } = useFormStatus()
  const pending = ctxPending || formPending
  return (
    <button type="submit" className={props.className ?? 'btn'} disabled={pending} name={props.name} value={props.value}>
      {pending ? (props.pendingText ?? 'Saving…') : props.children}
    </button>
  )
}

// ---- ConfirmButton ---------------------------------------------------------------------
/** Single-button form for destructive or outward-facing actions (delete, send). */
export function ConfirmButton(props: {
  action: FormAction
  confirm: string
  children: ReactNode
  className?: string
  hidden?: Record<string, string>
}) {
  const [state, formAction] = useActionState(props.action, null)
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(props.confirm)) e.preventDefault()
      }}
      style={{ display: 'inline' }}
    >
      {Object.entries(props.hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton className={props.className ?? 'btn btn-danger btn-sm'} pendingText="Working…">
        {props.children}
      </SubmitButton>
      {state?.error && (
        <span className="small" role="alert" style={{ color: 'var(--coral-ink)', marginLeft: 8 }}>
          {state.error}
        </span>
      )}
      {state?.ok && (
        <span className="small" role="status" style={{ color: 'var(--teal-deep)', marginLeft: 8 }}>
          {state.ok}
        </span>
      )}
    </form>
  )
}
