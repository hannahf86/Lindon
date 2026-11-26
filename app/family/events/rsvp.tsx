// =============================================================================
// family/events/rsvp.tsx — one shared event for a family: what, when, where,
// then a row per child with "Coming" / "Can't make it".
// The current answer is highlighted; tapping the other one changes it.
// Server component (forms post to answerEvent).
// =============================================================================
import { fmtDate } from '@/lib/dates'
import { eventKindLabel, eventTimeLabel } from '@/lib/events'
import type { FamilyEvent } from '@/lib/event-sharing'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Badge, Card } from '@/components/ui'
import { answerEvent } from './actions'

export function EventRsvp({ event: e }: { event: FamilyEvent }) {
  return (
    <Card
      title={e.title}
      actions={<Badge tone="purple">{eventKindLabel(e.kind)}</Badge>}
    >
      <div style={{ fontWeight: 800 }}>
        {fmtDate(e.event_date, 'EEEE d MMMM yyyy')} · {eventTimeLabel(e)}
      </div>
      {e.location && <div className="small muted">{e.location}</div>}
      {e.notes && <p className="small" style={{ whiteSpace: 'pre-line', margin: '8px 0 0' }}>{e.notes}</p>}

      <div style={{ marginTop: 12 }}>
        {e.pupils.map((p) => (
          <div key={p.id} className="rsvp-row">
            <span className="rsvp-name">{p.first_name}</span>
            {(['yes', 'no'] as const).map((r) =>
              p.response === r ? (
                <span key={r} className={`btn btn-sm ${r === 'yes' ? 'att-current' : 'btn-danger'}`} aria-current="true">
                  ✓ {r === 'yes' ? 'Coming' : 'Can’t make it'}
                </span>
              ) : (
                <ActionForm key={r} action={answerEvent.bind(null, e.id, p.id, r)} className="att-form">
                  <input type="hidden" name="note" value={p.note} />
                  <SubmitButton className="btn btn-secondary btn-sm" pendingText="…">
                    {r === 'yes' ? 'Coming' : 'Can’t make it'}
                  </SubmitButton>
                </ActionForm>
              ),
            )}
            {p.response === null && <span className="small muted">Please let us know</span>}
          </div>
        ))}
      </div>
    </Card>
  )
}
