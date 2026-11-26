// =============================================================================
// family/events/page.tsx — "Events": concerts, exam days, group lessons…
// the teacher has shared, with a "Coming" / "Can't make it" per child.
// Upcoming only; grouped by teacher when there's more than one.
// =============================================================================
import type { Metadata } from 'next'
import { requireFamily, teacherName } from '@/lib/family'
import { todayISO } from '@/lib/dates'
import { familyEvents } from '@/lib/event-sharing'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { EventRsvp } from './rsvp'

export const metadata: Metadata = { title: 'Events' }

export default async function FamilyEventsPage() {
  const ctx = await requireFamily()
  const perLink = await Promise.all(ctx.links.map((l) => familyEvents(l.teacher.id, l.pupils, todayISO(l.teacher.timezone))))
  const many = ctx.links.length > 1
  const total = perLink.reduce((n, list) => n + list.length, 0)

  return (
    <>
      <PageHeader title="Events" subtitle="Concerts, exam days and other events — let your teacher know who’s coming." />
      {total === 0 ? (
        <Card>
          <EmptyState title="No events coming up">When your teacher shares an event, it’ll appear here for you to reply to.</EmptyState>
        </Card>
      ) : (
        <div className="stack" style={{ gap: 20 }}>
          {ctx.links.map((l, i) =>
            perLink[i].length === 0 ? null : (
              <section key={l.accessId} className="stack" style={{ gap: 16 }}>
                {many && <h2 style={{ margin: 0 }}>From {teacherName(l.teacher)}</h2>}
                {perLink[i].map((e) => (
                  <EventRsvp key={e.id} event={e} />
                ))}
              </section>
            ),
          )}
        </div>
      )}
    </>
  )
}
