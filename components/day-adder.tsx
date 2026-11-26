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
//
// The pop-up first lists that day's lessons (Hannah's colleague's request):
// name, time, a one-tap "Present" button, and a dropdown for when they didn't
// come — Absent, Notice given, I cancelled. With lessons on the day, the
// add form sits behind "+ Add a lesson or event".
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
import { setAttendance } from '@/app/(app)/lessons/actions'
import type { LessonStatus } from '@/lib/database.types'

/** A lesson on the clicked day, for marking attendance in the pop-up. */
export type DayLesson = { id: string; time: string; end: string; name: string; firstName: string; status: LessonStatus }

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
export function DayAdder(props: {
  students: AdderStudent[]
  locations: string[]
  currencySymbol: string
  dayHref: string
  /** Lessons by local date (YYYY-MM-DD), for marking attendance */
  lessonsByDate?: Record<string, DayLesson[]>
  /** Teacher bills in advance: notice given / I cancelled earn a make-up credit */
  credits?: boolean
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [date, setDate] = useState('')
  const [kind, setKind] = useState<'lesson' | 'event'>('lesson')
  const [round, setRound] = useState(0) // remounts the forms each time, clearing old messages
  const [adding, setAdding] = useState(false)
  const dayLessons = (date && props.lessonsByDate?.[date]) || []

  const open = useCallback((d: string) => {
    setDate(d)
    setKind('lesson')
    setRound((r) => r + 1)
    setAdding(false)
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
              <h2 style={{ margin: 0 }}>{pretty}</h2>
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

          {/* ---- That day's lessons: mark attendance ---- */}
          {dayLessons.length > 0 && <DayAttendance key={`a-${round}`} lessons={dayLessons} credits={props.credits ?? true} />}

          {/* ---- Add a lesson or event (behind a button when the day has lessons) ---- */}
          {dayLessons.length > 0 && !adding ? (
            <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)} style={{ marginTop: 8 }}>
              + Add a lesson or event
            </button>
          ) : (
            <>
              {dayLessons.length > 0 && <h3 style={{ margin: '18px 0 10px' }}>Add to this day</h3>}
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
                  <EventForm key={`e-${round}`} date={date} onDone={close} students={props.students.map((s) => ({ id: s.id, label: s.name }))} />
                ))}
            </>
          )}
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
function EventForm(props: { date: string; onDone: () => void; students: { id: string; label: string }[] }) {
  const { state, pending, onSubmit } = useCalendarAction(createEvent, props.onDone)
  return (
    <form className="form" onSubmit={onSubmit}>
      <EventFields date={props.date} hideDate students={props.students} />
      <div className="form-actions">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Adding…' : 'Add event'}
        </button>
      </div>
      <FormErrorBox state={state} />
    </form>
  )
}

// ---- That day's lessons: Present button + "didn't come" dropdown ---------------------------
const MISSED: { status: LessonStatus; label: string; credit: boolean }[] = [
  { status: 'absent', label: 'Absent (no notice)', credit: false },
  { status: 'notice_given', label: 'Notice given', credit: true },
  { status: 'teacher_cancelled', label: 'I cancelled', credit: true },
]

function DayAttendance({ lessons, credits }: { lessons: DayLesson[]; credits: boolean }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<ActionState>(null)

  const mark = (l: DayLesson, status: LessonStatus) => {
    const missed = MISSED.find((m) => m.status === status)
    if (missed?.credit && credits) {
      const ok = window.confirm(
        `Mark ${l.firstName}'s lesson as "${missed.label.toLowerCase()}"? They get a make-up credit, which comes off next month's invoice, and the family is emailed to let them know.`,
      )
      if (!ok) return
    }
    setBusy(l.id)
    startTransition(async () => {
      setMessage(await setAttendance(l.id, status))
      setBusy(null)
    })
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <h3 style={{ margin: '0 0 8px' }}>Lessons</h3>
      <ul className="day-att">
        {lessons.map((l) => {
          const missed = MISSED.find((m) => m.status === l.status)
          return (
            <li key={l.id} className={`day-att-row ${l.status}`}>
              <span className="day-att-time">
                {l.time}–{l.end}
              </span>
              <Link href={`/lessons/${l.id}`} className="day-att-name">
                {l.name}
              </Link>
              <span className="day-att-actions">
                {l.status === 'present' ? (
                  <span className="btn btn-sm att-current">✓ Present</span>
                ) : (
                  <button type="button" className="btn btn-sm" disabled={busy === l.id} onClick={() => mark(l, 'present')}>
                    {busy === l.id ? '…' : 'Present'}
                  </button>
                )}
                <select
                  className="input input-sm"
                  aria-label={`${l.firstName} didn't come`}
                  value={missed?.status ?? ''}
                  disabled={busy === l.id}
                  onChange={(e) => e.target.value && mark(l, e.target.value as LessonStatus)}
                >
                  <option value="">{missed ? missed.label : 'Didn’t come…'}</option>
                  {MISSED.filter((m) => m.status !== l.status).map((m) => (
                    <option key={m.status} value={m.status}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </span>
            </li>
          )
        })}
      </ul>
      {message?.error && (
        <div className="alert alert-error" role="alert">
          {message.error}
        </div>
      )}
      {message?.ok && (
        <div className="alert alert-ok" role="status">
          {message.ok}
        </div>
      )}
    </div>
  )
}
