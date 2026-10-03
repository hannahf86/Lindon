'use client'
// =============================================================================
// components/pickers.tsx — choosing records and typing lists, without dropdowns
//
// Picker   — search box + always-visible scrolling list of radio/checkbox
//            options (students, guardians, library items…)
// TagInput — type an entry and press Enter/comma to add it as a chip
//            (instruments). Also offers the teacher's own past entries as
//            one-tap chips. Submits as one comma-separated hidden field.
// SuggestField — a single typed text box with one-tap "used before" chips
//            (exam boards, grades, item kinds, locations…). Tapping fills it.
// =============================================================================
import { useId, useMemo, useState, type KeyboardEvent } from 'react'

export type PickerOption = { id: string; label: string; sub?: string }

// ---- Picker -------------------------------------------------------------------------
export function Picker(props: {
  name: string
  label: string
  options: PickerOption[]
  defaultValue?: string | string[] | null
  multiple?: boolean
  /** Show a "None" choice (single mode) so a link can be removed */
  allowNone?: string
  hint?: string
  placeholder?: string
}) {
  const uid = useId()
  const [query, setQuery] = useState('')
  const initial = Array.isArray(props.defaultValue) ? props.defaultValue : props.defaultValue ? [props.defaultValue] : []
  const [selected, setSelected] = useState<string[]>(initial)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return props.options
    // Keep selected items visible even when they don't match the search
    return props.options.filter((o) => selected.includes(o.id) || `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(q))
  }, [query, props.options, selected])

  const toggle = (id: string) =>
    setSelected((cur) => (props.multiple ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]))

  return (
    <fieldset className="field">
      <legend className="field-label">{props.label}</legend>
      <div className="picker">
        {props.options.length > 6 && (
          <input
            className="input picker-search"
            type="search"
            placeholder={props.placeholder ?? 'Type to search…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`Search ${props.label.toLowerCase()}`}
            // Enter in the search box shouldn't submit the whole form
            onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          />
        )}
        <div className="picker-list">
          {props.allowNone && !props.multiple && (
            <label className="picker-option">
              <input type="radio" name={props.name} value="" checked={selected.length === 0} onChange={() => setSelected([])} />
              <span className="muted">{props.allowNone}</span>
            </label>
          )}
          {visible.map((o) => (
            <label key={o.id} className="picker-option">
              <input
                type={props.multiple ? 'checkbox' : 'radio'}
                name={props.name}
                value={o.id}
                checked={selected.includes(o.id)}
                onChange={() => toggle(o.id)}
                id={`${uid}-${o.id}`}
              />
              <span>
                <strong>{o.label}</strong>
                {o.sub && <span className="sub"> · {o.sub}</span>}
              </span>
            </label>
          ))}
          {visible.length === 0 && <div className="picker-empty">Nothing matches “{query}”.</div>}
        </div>
      </div>
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </fieldset>
  )
}

// ---- TagInput -------------------------------------------------------------------------
export function TagInput(props: {
  name: string
  label: string
  defaultValue?: string[]
  /** Values the teacher has used before — shown as quick-add chips */
  suggestions?: string[]
  placeholder?: string
  hint?: string
}) {
  const id = useId()
  const [tags, setTags] = useState<string[]>(props.defaultValue ?? [])
  const [draft, setDraft] = useState('')

  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, '').trim()
    if (v && !tags.some((t) => t.toLowerCase() === v.toLowerCase())) setTags([...tags, v])
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      setTags(tags.slice(0, -1))
    }
  }
  const unused = (props.suggestions ?? []).filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      {/* Typed-but-not-yet-added text is included too, so nothing is lost on save */}
      <input type="hidden" name={props.name} value={[...tags, draft.trim()].filter(Boolean).join(', ')} />
      {tags.length > 0 && (
        <div className="chips">
          {tags.map((t) => (
            <span className="chip" key={t}>
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        className="input"
        value={draft}
        placeholder={props.placeholder ?? 'Type and press Enter'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft.trim() && add(draft)}
        autoComplete="off"
      />
      {unused.length > 0 && (
        <div className="chips" aria-label="Previously used">
          {unused.map((s) => (
            <button type="button" className="chip chip-add" key={s} onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </div>
  )
}

// ---- SuggestField ----------------------------------------------------------------------
export function SuggestField(props: {
  label: string
  name: string
  defaultValue?: string | null
  suggestions?: string[]
  placeholder?: string
  hint?: string
  required?: boolean
  className?: string
}) {
  const id = useId()
  const [value, setValue] = useState(props.defaultValue ?? '')
  // Hide the chip that matches what's already in the box
  const chips = (props.suggestions ?? []).filter((s) => s.toLowerCase() !== value.trim().toLowerCase()).slice(0, 12)

  return (
    <div className={`field ${props.className ?? ''}`}>
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      <input
        id={id}
        className="input"
        name={props.name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={props.placeholder}
        required={props.required}
        autoComplete="off"
      />
      {chips.length > 0 && (
        <div className="chips" aria-label={`${props.label} you've used before`}>
          {chips.map((s) => (
            <button type="button" className="chip chip-add" key={s} onClick={() => setValue(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </div>
  )
}
