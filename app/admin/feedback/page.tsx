// =============================================================================
// app/admin/feedback/page.tsx — messages from the public Contact page
//
// New ones first, then ones already dealt with. Each shows what it's about,
// who sent it (reply by email), whether they were signed in, the page they
// came from and their browser (for bug reports). "Done" marks it dealt with;
// "Not done" puts it back. Admins only (app/admin/layout.tsx checks).
// =============================================================================
import type { Metadata } from 'next'
import { auth } from '@/auth'
import { db } from '@/lib/admin'
import { isAdmin } from '@/lib/access'
import { fmtTz } from '@/lib/dates'
import { ConfirmButton } from '@/components/forms'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { markFeedback } from '../actions'

export const metadata: Metadata = { title: 'Feedback' }

const KIND: Record<string, { label: string; tone: 'purple' | 'butter' | 'coral' | 'plain' }> = {
  suggestion: { label: 'Suggestion', tone: 'purple' },
  bug: { label: 'Bug', tone: 'coral' },
  question: { label: 'Question', tone: 'butter' },
  other: { label: 'Message', tone: 'plain' },
}

export default async function FeedbackPage() {
  const session = await auth()
  if (!isAdmin(session?.user?.email)) return null
  const { data } = await db().from('feedback').select('*').order('created_at', { ascending: false }).limit(300)
  const rows = data ?? []
  const open = rows.filter((r) => !r.handled_at)
  const done = rows.filter((r) => r.handled_at)

  const list = (items: typeof rows) => (
    <ul className="feedback-list">
      {items.map((r) => {
        const k = KIND[r.kind] ?? KIND.other
        return (
          <li key={r.id} className="feedback-item">
            <div className="spread">
              <span className="row" style={{ gap: 8 }}>
                <Badge tone={k.tone}>{k.label}</Badge>
                <strong>{r.name || r.email}</strong>
                <span className="small muted">{fmtTz(r.created_at, 'Europe/London', 'd MMM yyyy, HH:mm')}</span>
              </span>
              <ConfirmButton
                action={markFeedback.bind(null, r.id, !r.handled_at)}
                confirm={r.handled_at ? 'Move this back to New?' : 'Mark this as dealt with?'}
                className="btn btn-secondary btn-sm"
              >
                {r.handled_at ? 'Not done' : 'Done'}
              </ConfirmButton>
            </div>
            <p className="feedback-message">{r.message}</p>
            <div className="small muted">
              <a href={`mailto:${r.email}?subject=${encodeURIComponent('Re: your message about Lindon')}`}>{r.email}</a>
              {' · '}
              {r.signed_in_as ? `signed in as ${r.signed_in_as}` : 'not signed in'}
              {r.page && <> · came from {r.page}</>}
              {r.user_agent && <div className="feedback-ua">{r.user_agent}</div>}
            </div>
          </li>
        )
      })}
    </ul>
  )

  return (
    <>
      <PageHeader title="Feedback" subtitle="Suggestions, bug reports and questions from the Contact page." />
      <Card title={`New (${open.length})`}>{open.length ? list(open) : <EmptyState title="All caught up">New messages from the Contact page appear here.</EmptyState>}</Card>
      {done.length > 0 && <Card title={`Dealt with (${done.length})`}>{list(done)}</Card>}
    </>
  )
}
