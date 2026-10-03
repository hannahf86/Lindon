// =============================================================================
// components/ui.tsx — presentational building blocks (server-safe, no state)
//
// PageHeader · Card · Field · TextField · TextArea · MoneyField · Segmented ·
// SlidePill · Toggle · Badge · StatusBadge · EmptyState · Stat
//
// House rule: NO dropdown menus. Fixed choices use <Segmented> (radio pills);
// everything else (instruments, times, boards, grades) is typed by the teacher.
// =============================================================================
import Link from 'next/link'
import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { label as humanise } from '@/lib/format'

// ---- Page header ---------------------------------------------------------------
export function PageHeader(props: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  back?: { href: string; label: string }
}) {
  return (
    <header className="page-head">
      <div>
        {props.back && (
          <Link className="back" href={props.back.href}>
            ← {props.back.label}
          </Link>
        )}
        <h1>{props.title}</h1>
        {props.subtitle && <p>{props.subtitle}</p>}
      </div>
      {props.actions && <div className="page-actions">{props.actions}</div>}
    </header>
  )
}

// ---- Card ----------------------------------------------------------------------
export function Card(props: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${props.className ?? ''}`} id={props.id}>
      {(props.title || props.actions) && (
        <div className="card-head">
          {props.title && <h2>{props.title}</h2>}
          {props.actions && <div className="row">{props.actions}</div>}
        </div>
      )}
      {props.children}
    </section>
  )
}

// ---- Form fields -----------------------------------------------------------------
export function Field(props: { label: string; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={`field ${props.className ?? ''}`}>
      <label className="field-label" htmlFor={props.htmlFor}>
        {props.label}
      </label>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: ReactNode; wrapClass?: string }

/** Labelled text input. Pass type="date" / "email" / "tel" etc. as needed. */
export function TextField({ label, hint, wrapClass, ...input }: InputProps) {
  const id = input.id ?? `f-${input.name}`
  return (
    <Field label={label} hint={hint} className={wrapClass} htmlFor={id}>
      <input id={id} className="input" {...input} />
    </Field>
  )
}

/** Money input with the currency symbol shown inside the box. */
export function MoneyField({ label, hint, wrapClass, symbol = '£', ...input }: InputProps & { symbol?: string }) {
  const id = input.id ?? `f-${input.name}`
  return (
    <Field label={label} hint={hint} className={wrapClass} htmlFor={id}>
      <div className="input-prefix">
        <span aria-hidden>{symbol}</span>
        <input id={id} className="input" inputMode="decimal" autoComplete="off" {...input} />
      </div>
    </Field>
  )
}

export function TextArea({
  label,
  hint,
  wrapClass,
  ...area
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string; hint?: ReactNode; wrapClass?: string }) {
  const id = area.id ?? `f-${area.name}`
  return (
    <Field label={label} hint={hint} className={wrapClass} htmlFor={id}>
      <textarea id={id} className="textarea" {...area} />
    </Field>
  )
}

// ---- Segmented radio pills (the dropdown replacement) -----------------------------
export function Segmented(props: {
  label: string
  name: string
  options: readonly (string | { value: string; label: string })[]
  defaultValue?: string
  hint?: ReactNode
  className?: string
}) {
  return (
    <fieldset className={`field ${props.className ?? ''}`}>
      <legend className="field-label">{props.label}</legend>
      <div className="segmented" role="radiogroup">
        {props.options.map((o) => {
          const value = typeof o === 'string' ? o : o.value
          const text = typeof o === 'string' ? humanise(o) : o.label
          return (
            <label key={value}>
              <input type="radio" name={props.name} value={value} defaultChecked={props.defaultValue === value} />
              <span>{text}</span>
            </label>
          )
        })}
      </div>
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </fieldset>
  )
}

// ---- Slide pill (two-way choice with a sliding highlight) -------------------------
// Pure CSS: two radios inside a pill; a knob slides under whichever is checked.
export function SlidePill(props: {
  label: string
  name: string
  options: [{ value: string; label: string }, { value: string; label: string }]
  defaultValue?: string
  hint?: ReactNode
  className?: string
}) {
  return (
    <fieldset className={`field ${props.className ?? ''}`}>
      <legend className="field-label">{props.label}</legend>
      <div className="slide-pill" role="radiogroup">
        {props.options.map((o) => (
          <label key={o.value}>
            <input type="radio" name={props.name} value={o.value} defaultChecked={props.defaultValue === o.value} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </fieldset>
  )
}

// ---- Toggle switch -----------------------------------------------------------------
export function Toggle(props: { name: string; label: ReactNode; defaultChecked?: boolean; hint?: ReactNode }) {
  return (
    <div className="field">
      <label className="toggle">
        <input type="checkbox" name={props.name} defaultChecked={props.defaultChecked} />
        <span>{props.label}</span>
      </label>
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </div>
  )
}

// ---- Badges ----------------------------------------------------------------------
export type Tone = 'teal' | 'sky' | 'coral' | 'butter' | 'purple' | 'plain'

export function Badge({ tone = 'plain', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

const STATUS_TONES: Record<string, Tone> = {
  // students
  active: 'teal',
  paused: 'butter',
  left: 'plain',
  // lessons (attendance)
  scheduled: 'sky',
  present: 'teal',
  absent: 'butter',
  notice_given: 'coral',
  teacher_cancelled: 'purple',
  // invoices
  draft: 'plain',
  sent: 'sky',
  paid: 'teal',
  void: 'coral',
  overdue: 'coral',
  // exams
  planned: 'sky',
  entered: 'purple',
  taken: 'teal',
  withdrawn: 'plain',
  // loans
  'on loan': 'sky',
  returned: 'teal',
}

// Friendlier wording than the stored value for a few statuses
const STATUS_LABELS: Record<string, string> = { scheduled: 'Booked', notice_given: 'Notice given', teacher_cancelled: 'Teacher cancelled' }

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'plain'}>{STATUS_LABELS[status] ?? humanise(status)}</Badge>
}

// ---- Empty state --------------------------------------------------------------------
export function EmptyState(props: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{props.title}</h3>
      {props.children && <p>{props.children}</p>}
      {props.action}
    </div>
  )
}

// ---- Stat tile ------------------------------------------------------------------------
export function Stat(props: { label: string; value: ReactNode; note?: ReactNode; tone?: 'teal' | 'butter' | 'coral' | 'purple'; href?: string }) {
  const body = (
    <>
      <div className="stat-label">{props.label}</div>
      <div className="stat-value">{props.value}</div>
      {props.note && <div className="stat-note">{props.note}</div>}
    </>
  )
  return props.href ? (
    <Link href={props.href} className={`stat ${props.tone ?? ''}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      {body}
    </Link>
  ) : (
    <div className={`stat ${props.tone ?? ''}`}>{body}</div>
  )
}
