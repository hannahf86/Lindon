// =============================================================================
// components/teaching-hours.tsx — the teaching hours editor
//
// Left: "Add teaching hours" (day pills, from, to). Right: the hours so far,
// by day, each removable. Shared by onboarding (step 4) and
// Schedule → Teaching hours. Server component; the list is loaded here.
// =============================================================================
import { db, must } from '@/lib/db'
import { DAY_SHORT, dayName, duration, hhmm } from '@/lib/format'
import { minutesOf } from '@/lib/lessons'
import type { Teacher } from '@/lib/database.types'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Card, Segmented, TextField } from '@/components/ui'
import { addTeachingHours, removeTeachingHours } from '@/app/(app)/schedule/hours/actions'

export async function TeachingHoursEditor({ teacher }: { teacher: Teacher }) {
  const hours = must(await db().from('teaching_hours').select('id, day_of_week, starts, ends').eq('teacher_id', teacher.id).order('day_of_week').order('starts'))
  const total = hours.reduce((n, h) => n + minutesOf(h.ends) - minutesOf(h.starts), 0)

  return (
    <div className="grid grid-2" style={{ alignItems: 'start' }}>
      {/* ---- Add ---- */}
      <Card title="Add teaching hours">
        <ActionForm action={addTeachingHours}>
          <Segmented label="Day" name="day_of_week" options={DAY_SHORT.map((d, i) => ({ value: String(i + 1), label: d }))} defaultValue="6" />
          <div className="form-grid">
            <TextField label="From" name="starts" placeholder="e.g. 9:00" required autoComplete="off" />
            <TextField label="To" name="ends" placeholder="e.g. 17:00 or 5pm" required autoComplete="off" />
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Teach in two chunks on the same day (say 9–12 and 2–6)? Add each one separately.
          </p>
          <SubmitButton className="btn btn-secondary" pendingText="Adding…">
            Add hours
          </SubmitButton>
        </ActionForm>
      </Card>

      {/* ---- List ---- */}
      <Card title="Your teaching hours" actions={hours.length ? <span className="small muted">{duration(total)} a week</span> : null}>
        {hours.length === 0 ? (
          <p className="muted">None yet. Days without hours show as “Not a teaching day”.</p>
        ) : (
          <ul className="list">
            {hours.map((h) => (
              <li key={h.id} className="spread">
                <span>
                  <strong>{dayName(h.day_of_week)}</strong> · {hhmm(h.starts)}–{hhmm(h.ends)}
                </span>
                <ConfirmButton action={removeTeachingHours.bind(null, h.id)} confirm={`Remove ${dayName(h.day_of_week)} ${hhmm(h.starts)}–${hhmm(h.ends)}? Lessons already booked stay as they are.`} className="link-btn">
                  Remove
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
