'use client'
// =============================================================================
// components/location-select.tsx — the Location dropdown
//
// Lists the teacher's saved locations (Settings → Locations), plus
// "+ Add a new location…" which swaps the dropdown for a text box. Whatever is
// typed there is saved to the teacher's list when the form is saved (see
// lib/locations.ts → rememberLocation). An older value that isn't in the list
// any more stays selectable, so re-saving can't quietly wipe it.
// A deliberate exception to the no-dropdowns rule (Hannah's call).
// =============================================================================
import { useId, useState } from 'react'

export function LocationSelect(props: { locations: string[]; defaultValue?: string; name?: string; label?: string; wrapClass?: string }) {
  const name = props.name ?? 'location'
  const id = useId()
  const initial = props.defaultValue ?? ''
  const saved = props.locations ?? []
  const options = initial && !saved.includes(initial) ? [...saved, initial] : saved
  const [value, setValue] = useState(initial)
  const [adding, setAdding] = useState(false)

  return (
    <div className={`field ${props.wrapClass ?? ''}`}>
      <label className="field-label" htmlFor={id}>
        {props.label ?? 'Location'}
      </label>
      {adding ? (
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input id={id} className="input" name={name} placeholder="e.g. St Peter’s School" autoComplete="off" autoFocus style={{ flex: 1 }} />
          <button type="button" className="link-btn" onClick={() => setAdding(false)}>
            Pick from list
          </button>
        </div>
      ) : (
        <select
          id={id}
          className="input"
          name={name}
          value={value}
          onChange={(e) => (e.target.value === '__new__' ? setAdding(true) : setValue(e.target.value))}
        >
          <option value="">No location</option>
          {options.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
          <option value="__new__">＋ Add a new location…</option>
        </select>
      )}
      <span className="field-hint">{adding ? 'It’s added to your locations list when you save.' : 'Change your list in Settings → Locations.'}</span>
    </div>
  )
}
