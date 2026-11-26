'use client'
// =============================================================================
// components/day-adder.tsx — "click a day to add a lesson or event"
//
// <DayAdder> wraps the calendar and owns ONE pop-up (native <dialog>). Any
// <AddDayButton date="YYYY-MM-DD"> inside it opens that pop-up for its date:
//   · Lesson — choose a student from the dropdown (Hannah's call: a dropdown
//     here) and their usual time, length, price, instrument and location fill
//     in from their regular booking. "+ Add a new student…" goes to the
//     new-student form instead.
//   · Event  — concert, exam day, group lesson, mock exam or other.
// Both save without leaving the calendar; the pop-up closes on success and
// the calendar refreshes (the actions revalidate it).
// =============================================================================
import { createContext, startTransition, useActionState, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ActionState } from '@/lib/forms'
import { lengthOptions } from '@/lib/lessons'
import { MoneyField, SelectField, TextField } from '@/components/ui'
import { TimeField } from '@/components/time-field'
import { EventFields } from '@/components/event-fields'
import { LocationSelect } from '@/components/location-select'
import { addLessonFromCalendar } from '@/app/(app)/lessons/actions'
import { createEvent } from '@/app/(app)/events/actions'

/** A student plus the lesson details to pre-fill (from their regular booking). */
export type AdderStudent = { id: string; name: string; time: string; duration: number | null; price: number | null; instrument: string; location: string }

const OpenContext = createContext<(date: string) => void>(() => {})

// ---- The trigger (month cell, week "+ Add", day view button) ---------------------------
export function AddDayButton({ date, className, label, children }: { date: string; className?: string; label?: string; children: ReactNode }) {
  const open = useContext(OpenContext)
  return (
    <button type="button" className={className} aria-label={label} onClick={() => open(date)}>
      {children}
    </button>
  )
}

// ---- Provider + pop-up -----------------------------------------------------------------
export function DayAdder(props: { students: AdderStudent[]; locations: string[]; currencySymbol: string; dayHref: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<'lesson' | 'event'>('lesson')
  const [round, setRound] = useState(0) // remounts the forms each time, clearing old messages

  const open = useCallback((d: string) => {
    setDate(d)
    setKind('lesson')
    setRound((r) => r + 1)
    dialog.current?.showModal()
  }, [])
  const close = useCallback(() => dialog.current?.close(), [])
  const pretty = date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : ''

  return (
    <OpenContext.Provider value={open}>
      {props.children}
      <dialog ref={dialog} className="modal" aria-label={`Add to ${pretty}`} onClick={(e) => e.target === e.currentTarget && close()}>
        <div className="modal-body">
          {/* ---- Header ---- */}
          <div className="modal-head">
            <div>
              <h2 style={{ margin: 0 }}>Add to {pretty}</h2>
              {date && (
                <Link href={`${props.dayHref}?view=day&date=${date}`} className="small" onClick={close}>
                  Open this day →
                </Link>
              )}
            </div>
            <button type="button" className="modal-close" aria-label="Close" onClick={close}>
              ×
            </button>
          </div>

          {/* ---- Lesson or event ---- */}
          <div className="segmented" role="radiogroup" aria-label="What are you adding?" style={{ marginBottom: 16 }}>
            {(['lesson', 'event'] as const).map((k) => (
              <label key={k}>
                <input type="radio" name="add_kind" checked={kind === k} onChange={() => setKind(k)} />
                <span>{k === 'lesson' ? 'Lesson' : 'Event'}</span>
              </label>
            ))}
          </div>

          {date &&
            (kind === 'lesson' ? (
              <LessonForm key={`l-${round}`} date={date} students={props.students} locations={props.locations} currencySymbol={props.currencySymbol} onDone={close} />
            ) : (
              <EventForm key={`e-${round}`} date={date} onDone={close} />
            ))}
        </div>
      </dialog>
    </OpenContext.Provider>
  )
}

// ---- Shared: submit without React resetting the form on errors -------------------------
function useCalendarAction(action: (s: ActionState, fd: FormData) => Promise<ActionState>, onDone: () => void) {
  const [state, run, pending] = useActionState(action, null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => run(fd))
  }
  return { state, pending, onSubmit }
}

function FormErrorBox({ state }: { state: ActionState }) {
  return state?.error ? (
    <div className="alert alert-error" role="alert">
      {state.error}
    </div>
  ) : null
}

// ---- Lesson ----------------------------------------------------------------------------------
function LessonForm(props: { date: string; students: AdderStudent[]; locations: string[]; currencySymbol: string; onDone: () => void }) {
  const router = useRouter()
  const [studentId, setStudentId] = useState('')
  const { state, pending, onSubmit } = useCalendarAction(addLessonFromCalendar, props.onDone)
  const s = props.students.find((x) => x.id === studentId)

  return (
    <form className="form" onSubmit={onSubmit}>
      <input type="hidden" name="date" value={props.date} />

      {/* ---- Student (dropdown, with "add a new student") ---- */}
      <div className="field">
        <label className="field-label" htmlFor="adder-student">
          Student
        </label>
        <select
          id="adder-student"
          name="student_id"
          className="input"
          value={studentId}
          required
          onChange={(e) => {
            if (e.target.value === '__new__') return router.push('/students/new')
            setStudentId(e.target.value)
          }}
        >
          <option value="">Choose a student…</option>
          {props.students.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          <option value="__new__">＋ Add a new student…</option>
        </select>
        {s && !s.time && <span className="field-hint">{s.name} has no regular lesson yet, so fill in the details below.</span>}
      </div>

      {/* ---- Lesson details: re-filled whenever the student changes ---- */}
      <div className="form-grid" key={studentId}>
        <TimeField label="Start time" name="time" defaultValue={s?.time ?? ''} required />
        <SelectField label="Lesson length" name="duration_minutes" options={lengthOptions(s?.duration ?? undefined)} defaultValue={String(s?.duration ?? 30)} />
        <MoneyField label="Price" name="price" symbol={props.currencySymbol} defaultValue={s?.price != null ? s.price.toFixed(2) : ''} placeholder="0.00" />
        <TextField label="Instrument" name="instrument" defaultValue={s?.instrument ?? ''} placeholder="e.g. Piano" autoComplete="off" />
        <LocationSelect locations={props.locations} defaultValue={s?.location ?? ''} wrapClass="full" />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Adding…' : 'Add lesson'}
        </button>
      </div>
      <FormErrorBox state={state} />
    </form>
  )
}

// ---- Event -------------------------------------------------------------------------------------
function EventForm(props: { date: string; onDone: () => void }) {
  const { state, pending, onSubmit } = useCalendarAction(createEvent, props.onDone)
  return (
    <form className="form" onSubmit={onSubmit}>
      <EventFields date={props.date} hideDate />
      <div className="form-actions">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Adding…' : 'Add event'}
        </button>
      </div>
      <FormErrorBox state={state} />
    </form>
  )
}
