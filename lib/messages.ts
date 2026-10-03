// =============================================================================
// lib/messages.ts — in-app messages between a teacher and a family
//
// One conversation per family contact (a guardian, or an adult pupil) per
// teacher. Messages are permanent — the database refuses edits and deletes.
// Every new message sends the other side a short email alert with a link
// back into Lindon, so nobody has to keep checking the app.
// =============================================================================
import 'server-only'
import { db } from './admin'
import { fullName } from './format'
import { sendEmail, studioName } from './email'
import { newMessageEmail } from './email-templates'
import { FormError } from './forms'
import type { Conversation, Teacher } from './database.types'

/** Absolute URL of this app (for links in emails). */
export function appUrl(path = ''): string {
  const base =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3107')
  return base.replace(/\/$/, '') + path
}

export type ConversationTarget = { guardianId: string } | { studentId: string }

/** Find (or start) the conversation with a guardian / adult pupil. */
export async function conversationFor(teacherId: string, target: ConversationTarget): Promise<Conversation> {
  const col = 'guardianId' in target ? 'guardian_id' : 'student_id'
  const id = 'guardianId' in target ? target.guardianId : target.studentId

  const existing = await db().from('conversations').select('*').eq('teacher_id', teacherId).eq(col, id).maybeSingle()
  if (existing.data) return existing.data

  // Snapshot the contact's name so the record still reads right if they're deleted later
  let contactName = ''
  if ('guardianId' in target) {
    const { data } = await db().from('guardians').select('first_name, last_name').eq('id', id).eq('teacher_id', teacherId).maybeSingle()
    if (!data) throw new FormError('That contact no longer exists.')
    contactName = fullName(data)
  } else {
    const { data } = await db().from('students').select('first_name, last_name').eq('id', id).eq('teacher_id', teacherId).maybeSingle()
    if (!data) throw new FormError('That pupil no longer exists.')
    contactName = fullName(data)
  }

  const created = await db()
    .from('conversations')
    .insert({
      teacher_id: teacherId,
      guardian_id: 'guardianId' in target ? id : null,
      student_id: 'studentId' in target ? id : null,
      contact_name: contactName,
    })
    .select('*')
    .single()
  if (created.data) return created.data
  // Lost a race with another request creating it — read the winner
  const again = await db().from('conversations').select('*').eq('teacher_id', teacherId).eq(col, id).single()
  if (again.error) throw new Error(again.error.message)
  return again.data
}

/** Email addresses that should hear about a teacher's message in this conversation. */
async function familyEmails(c: Conversation): Promise<string[]> {
  let q = db().from('family_access').select('email').eq('teacher_id', c.teacher_id).is('revoked_at', null)
  if (c.guardian_id) q = q.eq('guardian_id', c.guardian_id)
  else if (c.student_id) q = q.eq('student_id', c.student_id)
  else return []
  const invited = (await q).data?.map((r) => r.email) ?? []
  if (invited.length) return invited
  // Not invited to Lindon yet: fall back to the email on their record
  if (c.guardian_id) {
    const { data } = await db().from('guardians').select('email').eq('id', c.guardian_id).maybeSingle()
    return data?.email ? [data.email] : []
  }
  const { data } = await db().from('students').select('email').eq('id', c.student_id!).maybeSingle()
  return data?.email ? [data.email] : []
}

/**
 * Add a message and alert the other side by email.
 * The caller must already have checked the sender may use this conversation.
 */
export async function postMessage(opts: {
  teacher: Teacher
  conversation: Conversation
  sender: 'teacher' | 'family'
  senderEmail: string
  senderName: string
  body: string
}): Promise<void> {
  const body = opts.body.trim()
  if (!body) throw new FormError('Write a message first.')
  if (body.length > 5000) throw new FormError('That message is too long (5,000 characters max).')

  const { error } = await db().from('messages').insert({
    teacher_id: opts.teacher.id,
    conversation_id: opts.conversation.id,
    sender: opts.sender,
    sender_email: opts.senderEmail,
    body,
  })
  if (error) throw new Error(error.message)

  // Email alert (failures are logged in email_log, never block the message)
  const toTeacher = opts.sender === 'family'
  const to = toTeacher ? [opts.teacher.email].filter(Boolean) : await familyEmails(opts.conversation)
  if (to.length === 0) return
  await sendEmail({
    teacher: opts.teacher,
    to,
    kind: 'message_notice',
    email: newMessageEmail({
      studio: studioName(opts.teacher),
      fromName: opts.senderName,
      body,
      url: toTeacher ? appUrl(`/messages/${opts.conversation.id}`) : appUrl('/family/messages'),
    }),
  })
}

/** Mark one side's unread messages as read. */
export async function markRead(conversation: Conversation, reader: 'teacher' | 'family'): Promise<void> {
  const unread = reader === 'teacher' ? conversation.teacher_unread : conversation.family_unread
  if (!unread) return
  const otherSide = reader === 'teacher' ? 'family' : 'teacher'
  await db()
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversation.id)
    .eq('teacher_id', conversation.teacher_id)
    .eq('sender', otherSide)
    .is('read_at', null)
  await db()
    .from('conversations')
    .update(reader === 'teacher' ? { teacher_unread: 0 } : { family_unread: 0 })
    .eq('id', conversation.id)
    .eq('teacher_id', conversation.teacher_id)
}

/** Total unread for the teacher (sidebar badge). */
export async function teacherUnreadCount(teacherId: string): Promise<number> {
  const { data } = await db().from('conversations').select('teacher_unread').eq('teacher_id', teacherId).gt('teacher_unread', 0)
  return (data ?? []).reduce((n, c) => n + c.teacher_unread, 0)
}
