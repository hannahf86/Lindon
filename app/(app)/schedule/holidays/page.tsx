// =============================================================================
// schedule/holidays/page.tsx — Schedule → Holidays: holidays and term breaks
//
// Left: add one (name, first day, last day, optionally tell every family).
// Right: coming up, then past ones, each removable. While a holiday is on,
// regular bookings make no lessons (so nothing is charged) and the calendar
// shows it with no free time.
// =============================================================================
import type { Metadata } from 'next'
import { db, must, requireTeacher } from '@/lib/db'
import { fmtDate, todayISO, diffDays } from '@/lib/dates'
import { has } from '@/lib/features'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Card, PageHeader, TextField, Toggle } from '@/components/ui'
import { ScheduleTabs } from '../tabs'
import { addHoliday, removeHoliday } from './actions'

export const metadata: Metadata = { title: 'Holidays' }

export default async function HolidaysPage() {
  const teacher = await requireTeacher()
  const today = todayISO(teacher.timezone)
  const all = must(await db().from('holidays').select('id, name, starts_on, ends_on').eq('teacher_id', teacher.id).order('starts_on'))
  const upcoming = all.filter((h) => h.ends_on >= today)
  const past = all.filter((h) => h.ends_on < today).reverse().slice(0, 10)
  const span = (h: { starts_on: string; ends_on: string }) =>
    h.starts_on === h.ends_on ? fmtDate(h.starts_on, 'EEE d MMM yyyy') : `${fmtDate(h.starts_on, 'EEE d MMM')} – ${fmtDate(h.ends_on, 'EEE d MMM yyyy')}`
  const days = (h: { starts_on: string; ends_on: string }) => diffDays(h.starts_on, h.ends_on) + 1

  return (
    <>
      <PageHeader title="Schedule" subtitle="Holidays and term breaks: no lessons are booked (or charged) on these days." />
      <div style={{ marginBottom: 28 }}>
        <ScheduleTabs current="holidays" />
      </div>

      <div className="split split-form-first">
        {/* ---- Add ---- */}
        <Card title="Add a holiday or term break">
          <ActionForm action={addHoliday} resetOnSuccess>
            <TextField label="Name" name="name" placeholder="e.g. Half term, Christmas holidays" required autoComplete="off" />
            <div className="form-grid">
              <TextField label="First day" name="starts_on" type="date" required />
              <TextField label="Last day" name="ends_on" type="date" hint="Leave empty for a single day." />
            </div>
            {has(teacher, 'messaging') && (
              <Toggle
                name="announce"
                label="Tell every family"
                defaultChecked
                hint="Sends an announcement to every active pupil’s family saying there are no lessons then and they won’t be charged."
              />
            )}
            <p className="small muted" style={{ margin: 0 }}>
              Regular lessons in these days are taken off. Any that were already on an invoice are marked “I cancelled” instead (a make-up credit if you bill in advance, not charged in arrears).
            </p>
            <div className="form-actions">
              <SubmitButton pendingText="Adding…">Add holiday</SubmitButton>
            </div>
          </ActionForm>
        </Card>

        {/* ---- List ---- */}
        <div className="stack">
          <Card title="Coming up">
            {upcoming.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                None yet. Add your half terms and holidays so lessons skip them automatically.
              </p>
            ) : (
              <ul className="list">
                {upcoming.map((h) => (
                  <li key={h.id} className="spread">
                    <span>
                      <strong>{h.name}</strong>
                      <div className="small muted">
                        {span(h)} · {days(h)} day{days(h) === 1 ? '' : 's'}
                        {h.starts_on <= today && ' · on now'}
                      </div>
                    </span>
                    <ConfirmButton
                      action={removeHoliday.bind(null, h.id)}
                      confirm={`Remove ${h.name}? Regular lessons will be booked back in for those days.`}
                      className="btn btn-ghost btn-sm"
                    >
                      Remove
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {past.length > 0 && (
            <Card title="Past">
              <ul className="list">
                {past.map((h) => (
                  <li key={h.id} className="small">
                    <strong>{h.name}</strong> · {span(h)}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
