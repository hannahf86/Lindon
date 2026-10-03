// =============================================================================
// app/family/messages/page.tsx — the family's conversation with their teacher
//
// One conversation per teacher. With several teachers, tabs switch between
// them (?t=<teacherId>, only accepted if it's one of their own links).
// Viewing never creates a conversation; replying does (via the action).
// Messages are a permanent record — there's no edit or delete.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must } from '@/lib/db'
import { linkForTeacher, requireFamily, teacherName } from '@/lib/family'
import { markRead } from '@/lib/messages'
import { fmtTz } from '@/lib/dates'
import { Card, EmptyState, PageHeader, TextArea } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { sendFamilyMessage } from '../actions'
import { conversationForLink, studioLine } from '../_lib/family-data'
import { RefreshOnRead } from './refresh-on-read'

export const metadata: Metadata = { title: 'Messages' }

export default async function FamilyMessagesPage({ searchParams }: PageProps<'/family/messages'>) {
  const ctx = await requireFamily()
  const sp = await searchParams

  // ---- Which teacher (validated against their own links) ----
  const requested = typeof sp.t === 'string' ? linkForTeacher(ctx, sp.t) : null
  const link = requested ?? ctx.links[0]
  const tz = link.teacher.timezone
  const tName = teacherName(link.teacher)

  // ---- Conversation + messages (oldest first) ----
  const [conversation, allConvs] = await Promise.all([conversationForLink(link), Promise.all(ctx.links.map(conversationForLink))])
  const messages = conversation
    ? must(
        await db()
          .from('messages')
          .select('id, sender, body, created_at')
          .eq('teacher_id', link.teacher.id)
          .eq('conversation_id', conversation.id)
          .order('created_at')
          .limit(1000),
      )
    : []

  // Mark the teacher's messages as read now they've been seen
  const hadUnread = !!conversation && conversation.family_unread > 0
  if (conversation && hadUnread) await markRead(conversation, 'family')

  return (
    <>
      {hadUnread && <RefreshOnRead />}
      <PageHeader title="Messages" subtitle={`Your conversation with ${studioLine(link.teacher)}.`} />

      {/* ---- Teacher tabs (only with more than one teacher) ---- */}
      {ctx.links.length > 1 && (
        <nav className="tabs" aria-label="Teacher">
          {ctx.links.map((l, i) => {
            const unread = l.teacher.id === link.teacher.id ? 0 : (allConvs[i]?.family_unread ?? 0)
            return (
              <Link key={l.accessId} href={`/family/messages?t=${l.teacher.id}`} aria-current={l.teacher.id === link.teacher.id ? 'page' : undefined}>
                {teacherName(l.teacher)}
                {unread > 0 && <span className="fam-count" style={{ marginLeft: 6 }}>{unread}</span>}
              </Link>
            )
          })}
        </nav>
      )}

      {/* ---- Thread ---- */}
      <Card>
        {messages.length === 0 ? (
          <EmptyState title="No messages yet">
            Have a question about lessons, practice or anything else? Write to {tName} below.
          </EmptyState>
        ) : (
          <div className="bubble-list">
            {messages.map((m) => {
              const mine = m.sender === 'family'
              return (
                <div key={m.id} className={`bubble ${mine ? 'mine' : 'theirs'}`}>
                  <div className="bubble-meta">
                    {mine ? 'You' : tName} · {fmtTz(m.created_at, tz, 'EEE d MMM, HH:mm')}
                  </div>
                  {m.body}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ---- Reply ---- */}
      <Card title={messages.length ? 'Reply' : `Message ${tName}`}>
        <ActionForm action={sendFamilyMessage.bind(null, link.teacher.id)} resetOnSuccess>
          <TextArea label="Your message" name="body" required maxLength={5000} placeholder={`Write to ${tName}…`} />
          <div className="form-actions">
            <SubmitButton pendingText="Sending…">Send message</SubmitButton>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Messages are kept as a permanent record and can’t be edited or deleted afterwards. {tName} will get an email to let them know you’ve
            written, and you’ll get one when they reply.
          </p>
        </ActionForm>
      </Card>
    </>
  )
}
