// =============================================================================
// messages/[id]/page.tsx — one conversation with a parent or adult pupil
//
// Header: who they are, their linked pupils, family-login status.
// Thread: oldest → newest as chat bubbles (yours on the right, theirs on the
// left), times in the teacher's timezone. Viewing marks their messages read.
// Reply box at the bottom — messages are permanent and the family is
// alerted by email.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName, isMinor } from '@/lib/format'
import { fmtTz } from '@/lib/dates'
import { markRead } from '@/lib/messages'
import { accessRows, accessStatus, accessText } from '@/lib/family-invites'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Badge, Card, PageHeader } from '@/components/ui'
import { sendTeacherMessage } from '../actions'
import { ThreadEffects } from './thread-effects'

export const metadata: Metadata = { title: 'Conversation' }

export default async function ConversationPage({ params }: PageProps<'/messages/[id]'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const teacher = await requireTeacher()
  const tz = teacher.timezone

  const { data: c } = await db()
    .from('conversations')
    .select(
      `*,
       guardians(id, first_name, last_name, email, student_guardians(students(id, first_name, last_name, status))),
       students(id, first_name, last_name, email, date_of_birth, is_minor)`,
    )
    .eq('id', id)
    .eq('teacher_id', teacher.id)
    .maybeSingle()
  if (!c) notFound()

  const g = c.guardian_id ? c.guardians : null
  const s = c.student_id ? c.students : null
  const [messages, access] = await Promise.all([
    db().from('messages').select('*').eq('teacher_id', teacher.id).eq('conversation_id', id).order('created_at').then(must),
    g || s ? accessRows(teacher.id, g ? { guardianId: g.id } : { studentId: s!.id }) : Promise.resolve([]),
  ])

  // ---- Mark their messages as read ----
  // (strip the embeds: markRead only needs the conversation row)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { guardians: _g, students: _s, ...conversation } = c
  const hadUnread = conversation.teacher_unread > 0
  await markRead(conversation, 'teacher')

  const name = g ? fullName(g) : s ? fullName(s) : c.contact_name || 'Deleted contact'
  const deleted = !g && !s
  const childNow = !!s && isMinor(s) // safeguarding: never message an under-18 directly
  const pupils = g
    ? g.student_guardians.map((l) => l.students).filter((p): p is NonNullable<typeof p> => !!p && p.status !== 'left')
    : []
  const status = accessStatus(access)
  const canReply = !deleted && !childNow
  const hasEmail = !!(g?.email || s?.email)
  const first = name.split(' ')[0]

  return (
    <>
      {/* ---- Header ---- */}
      <PageHeader
        title={deleted ? `${name} (deleted)` : name}
        back={{ href: '/messages', label: 'Messages' }}
        subtitle={
          <span className="row" style={{ gap: 6 }}>
            {s && <Badge tone="purple">Adult pupil</Badge>}
            {pupils.length > 0 && (
              <span>
                Parent of{' '}
                {pupils.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ', '}
                    <Link href={`/students/${p.id}`}>{fullName(p)}</Link>
                  </span>
                ))}
              </span>
            )}
            {!deleted && <span>· {accessText(status, tz, hasEmail)}</span>}
          </span>
        }
        actions={
          g ? (
            <Link className="btn btn-secondary" href={`/contacts/${g.id}`}>
              Contact page
            </Link>
          ) : s ? (
            <Link className="btn btn-secondary" href={`/students/${s.id}`}>
              Student page
            </Link>
          ) : undefined
        }
      />

      {/* ---- Thread ---- */}
      <Card>
        <ThreadEffects threadId="thread" count={messages.length} refresh={hadUnread} />
        {messages.length === 0 ? (
          <p className="muted" style={{ textAlign: 'center', padding: '24px 0' }}>
            No messages yet. Say hello below.
          </p>
        ) : (
          <div id="thread" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '60vh', overflowY: 'auto', padding: 4 }}>
            {messages.map((m) => {
              const mine = m.sender === 'teacher'
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: 'min(560px, 85%)' }}>
                  <div
                    style={{
                      background: mine ? 'var(--teal-wash)' : '#fff',
                      border: mine ? '2px solid transparent' : '2px solid var(--line)',
                      borderRadius: 18,
                      borderBottomRightRadius: mine ? 6 : 18,
                      borderBottomLeftRadius: mine ? 18 : 6,
                      padding: '10px 14px',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      lineHeight: 1.5,
                    }}
                  >
                    {m.body}
                  </div>
                  <div className="small muted" style={{ textAlign: mine ? 'right' : 'left', marginTop: 2, padding: '0 6px' }} title={m.sender_email}>
                    {mine ? 'You' : name} · {fmtTz(m.created_at, tz, 'EEE d MMM, HH:mm')}
                    {mine && m.read_at && ' · Seen'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ---- Reply ---- */}
      <Card>
        {canReply ? (
          <ActionForm action={sendTeacherMessage.bind(null, id)} resetOnSuccess>
            <div className="field">
              <label className="field-label" htmlFor="f-body">
                Reply to {first}
              </label>
              <textarea id="f-body" name="body" className="textarea" rows={4} maxLength={5000} required />
              <span className="field-hint">
                Messages are kept as a permanent record — they can’t be edited or deleted.{' '}
                {status.live
                  ? `${first} will also get an email to say there’s a new message.`
                  : hasEmail
                    ? `${first} hasn’t got a Lindon login, so they’ll get your message by email.`
                    : `${first} hasn’t got a Lindon login or an email address, so they won’t be told about this message.`}
              </span>
            </div>
            <div className="form-actions">
              <SubmitButton pendingText="Sending…">Send message</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {deleted
              ? 'This contact has been deleted. The conversation is kept as a permanent record, but you can’t send new messages.'
              : `${name} is under 18, so can’t be messaged directly — message their parent instead.`}
          </p>
        )}
      </Card>
    </>
  )
}
