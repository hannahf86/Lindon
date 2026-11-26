'use client'
// =============================================================================
// family/lessons/[id]/reschedule/chooser.tsx — free times as buttons, day by
// day; picking one opens the confirm step (with the 24h charging message and
// an optional note) before anything is saved.
// =============================================================================
import { useState } from 'react'
import { ActionForm, SubmitButton } from '@/components/forms'
import { familyRescheduleLesson } from '../../actions'

type Day = { date: string; label: string; times: string[] }

export function RescheduleChooser({ lessonId, late, days }: { lessonId: string; late: boolean; days: Day[] }) {
  const [pick, setPick] = useState<{ date: string; label: string; time: string } | null>(null)

  if (pick) {
    return (
      <ActionForm action={familyRescheduleLesson.bind(null, lessonId)}>
        <input type="hidden" name="date" value={pick.date} />
        <input type="hidden" name="time" value={pick.time} />
        <div className="alert alert-info" style={{ margin: 0 }}>
          Move this lesson to <strong>{pick.label} at {pick.time}</strong>?{' '}
          {late ? 'You’ll still be charged for the original lesson, and this is an extra lesson at the usual price.' : 'You won’t be charged for the original lesson.'}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="resched-note">
            Note for your teacher (optional)
          </label>
          <textarea id="resched-note" name="note" className="textarea" rows={3} maxLength={1000} placeholder="e.g. Sorry — school trip that day" />
        </div>
        <div className="form-actions">
          <SubmitButton pendingText="Moving…">Confirm new time</SubmitButton>
          <button type="button" className="btn btn-ghost" onClick={() => setPick(null)}>
            Pick a different time
          </button>
        </div>
      </ActionForm>
    )
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {days.map((d) => (
        <div key={d.date}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>{d.label}</div>
          <div className="row" style={{ gap: 8 }}>
            {d.times.map((t) => (
              <button key={t} type="button" className="btn btn-secondary btn-sm" onClick={() => setPick({ date: d.date, label: d.label, time: t })}>
                {t}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
