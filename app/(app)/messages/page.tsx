// =============================================================================
// messages/page.tsx — "Inbox" tab: in-app conversations with families
//
// One conversation per parent/guardian or adult pupil, newest first, with
// who they are, which pupils they're linked to, the latest message, unread
// count and whether they have a family login. "New message" opens a picker
// of everyone you may message (parents + adult pupils — never a child).
// The other tab, "Email families" (/messages/email), sends one-off emails.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireTeacher } from '@/lib/db'
import { fmtTz, todayISO } from '@/lib/dates'
import { ActionForm, SubmitButton } from '@/components/forms'
import { ModalButton } from '@/components/modal'
import { Picker } from '@/components/pickers'
import { Badge, Card, EmptyState, PageHeader, type Tone } from '@/components/ui'
import type { AccessState } from '@/lib/family-invites'
import { startConversation } from './actions'
import { loadInbox, messageableOptions } from './data'
import { MessagesTabs } from './tabs'

export const metadata: Metadata = { title: 'Messages' }

const ACCESS_BADGE: Record<AccessState, { tone: Tone; label: string } | null> = {
  none: null,
  invited: { tone: 'butter', label: 'Invited' },
  active: { tone: 'teal', label: 'Has a login' },
  removed: { tone: 'coral', label: 'Access removed' },
}

export default async function InboxPage() {
  const teacher = await requireTeacher()
  const tz = teacher.timezone
  const [rows, options] = await Promise.all([loadInbox(teacher.id), messageableOptions(teacher.id)])
  const unread = rows.reduce((n, r) => n + r.unread, 0)
  const today = todayISO(tz)
  // Today → "14:05", otherwise "3 Oct"
  const when = (iso: string) => (fmtTz(iso, tz, 'yyyy-MM-dd') === today ? fmtTz(iso, tz, 'HH:mm') : fmtTz(iso, tz, 'd MMM'))

  // ---- "New message" pop-up ----
  const newMessage =
    options.length > 0 ? (
      <ModalButton label="New message" title="New message">
        <ActionForm action={startConversation}>
          <Picker name="who" label="Who to" options={options} placeholder="Type a name…" />
          <p className="small muted" style={{ margin: 0 }}>
            You can message parents and guardians, and pupils who are 18 or over. For children, message their parents.
          </p>
          <div className="form-actions">
            <SubmitButton pendingText="Opening…">Open conversation</SubmitButton>
          </div>
        </ActionForm>
      </ModalButton>
    ) : (
      <Link href="/contacts/new" className="btn">
        Add a parent or contact
      </Link>
    )

  return (
    <>
      <PageHeader title="Messages" subtitle="Your conversations with parents and adult pupils." actions={newMessage} />
      <MessagesTabs current="inbox" unread={unread} />

      {/* ---- Conversation list ---- */}
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No messages yet">
            Start a conversation with “New message”. Once you’ve invited a family to Lindon (from their contact page), they can
            message you here too — until then, they’ll get your messages by email.
          </EmptyState>
        ) : (
          <ul className="list">
            {rows.map((r) => {
              const access = ACCESS_BADGE[r.access.state]
              return (
                <li key={r.id}>
                  <Link
                    href={`/messages/${r.id}`}
                    style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textDecoration: 'none', color: 'inherit' }}
                  >
                    {/* ---- Who + preview ---- */}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="row" style={{ gap: 6 }}>
                        <strong style={{ color: 'var(--teal-ink)' }}>{r.name}</strong>
                        {r.deleted && <span className="small muted">(deleted)</span>}
                        {r.kind === 'student' && <Badge tone="purple">Adult pupil</Badge>}
                        {access && <Badge tone={access.tone}>{access.label}</Badge>}
                      </span>
                      {r.kind === 'guardian' && r.pupils.length > 0 && (
                        <span className="small muted" style={{ display: 'block' }}>
                          Parent of {r.pupils.map((p) => p.name).join(', ')}
                        </span>
                      )}
                      <span
                        className="small"
                        style={{
                          display: 'block',
                          marginTop: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: r.unread ? 800 : 400,
                          color: r.unread ? 'var(--ink)' : 'var(--muted)',
                        }}
                      >
                        {r.latest ? `${r.latest.sender === 'teacher' ? 'You: ' : ''}${r.latest.body}` : 'No messages yet'}
                      </span>
                    </span>

                    {/* ---- Time + unread ---- */}
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flex: 'none' }}>
                      {r.lastAt && <span className="small muted">{when(r.lastAt)}</span>}
                      {r.unread > 0 && <Badge tone="coral">{r.unread} new</Badge>}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <p className="small muted" style={{ marginTop: 12 }}>
        Messages are kept as a permanent record — they can’t be edited or deleted.
      </p>
    </>
  )
}
