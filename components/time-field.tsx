// =============================================================================
// components/time-field.tsx — a time picker in 15-minute steps (Hannah's call)
//
// A dropdown of times from 06:00 to 22:45, every 15 minutes, shown 24-hour
// ("16:30"). Submits "HH:MM", which the actions read with parseTime().
// A saved time that isn't on the 15-minute grid (e.g. 16:20 from before)
// stays in the list, so re-saving can't quietly move a lesson.
// Required pickers start on "Choose a time…"; optional ones offer an empty
// choice with your own wording (e.g. "All day", "Not yet").
// Server-safe, no state. Exam times stay typed (boards set odd times).
// =============================================================================
import { SelectField } from '@/components/ui'

const FIRST = 6 * 60 // 06:00
const LAST = 22 * 60 + 45 // 22:45

const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function TimeField(props: {
  label: string
  name: string
  defaultValue?: string | null // "HH:MM" or "HH:MM:SS"
  required?: boolean
  /** Optional pickers: the wording of the empty choice */
  emptyLabel?: string
  hint?: string
  wrapClass?: string
}) {
  const current = props.defaultValue ? props.defaultValue.slice(0, 5) : ''
  const times: string[] = []
  for (let m = FIRST; m <= LAST; m += 15) times.push(clock(m))
  if (current && !times.includes(current)) times.push(current)
  times.sort()

  const options = [{ value: '', label: props.required ? 'Choose a time…' : (props.emptyLabel ?? 'No time') }, ...times.map((t) => ({ value: t, label: t }))]
  return (
    <SelectField
      key={current}
      label={props.label}
      name={props.name}
      id={`f-${props.name}`}
      options={options}
      defaultValue={current}
      required={props.required}
      hint={props.hint}
      wrapClass={props.wrapClass}
    />
  )
}
