// =============================================================================
// lib/email.ts — sending through Resend + writing the email log
//
// From:     "<Studio name> <address from EMAIL_FROM>"
// Reply-To: the teacher's own email, so parents' replies go straight to them.
// Each recipient gets their own copy (batch send) so parents never see each
// other's addresses.
// =============================================================================
import 'server-only'
import { Resend } from 'resend'
import { db } from './db'
import type { EmailKind, Teacher } from './database.types'
import type { Email } from './email-templates'

let resend: Resend | null = null
function client(): Resend {
  if (!process.env.AUTH_RESEND_KEY) throw new Error('AUTH_RESEND_KEY is not set — email is switched off.')
  resend ??= new Resend(process.env.AUTH_RESEND_KEY)
  return resend
}

/** Studio display name used in From lines and email headers. */
export function studioName(t: Teacher): string {
  return t.business_name || t.display_name || 'Music lessons'
}

/** Name to sign emails with. */
export function signature(t: Teacher): string {
  return t.display_name || t.business_name || ''
}

function fromAddress(t: Teacher): string {
  const configured = process.env.EMAIL_FROM ?? 'onboarding@resend.dev'
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured
  const name = studioName(t).replace(/["<>]/g, '')
  return `"${name}" <${address}>`
}

export type SendResult = { sent: number; failed: number; error?: string }

/**
 * Send one email to each address in `to` (deduplicated) and log it.
 * Never throws for delivery problems — returns counts so the UI can report.
 */
export async function sendEmail(opts: {
  teacher: Teacher
  to: string[]
  email: Email
  kind: EmailKind
  lessonId?: string
  invoiceId?: string
}): Promise<SendResult> {
  const recipients = [...new Set(opts.to.map((e) => e.trim().toLowerCase()).filter((e) => /\S+@\S+\.\S+/.test(e)))]
  if (recipients.length === 0) return { sent: 0, failed: 0, error: 'No email addresses to send to.' }

  let error: string | undefined
  let sent = 0
  try {
    const from = fromAddress(opts.teacher)
    const replyTo = opts.teacher.email || undefined
    // Resend batch accepts up to 100 messages per call
    for (let i = 0; i < recipients.length; i += 100) {
      const chunk = recipients.slice(i, i + 100)
      const { error: batchError } = await client().batch.send(
        chunk.map((to) => ({
          from,
          to,
          replyTo,
          subject: opts.email.subject,
          html: opts.email.html,
          text: opts.email.text,
        })),
      )
      if (batchError) {
        error = batchError.message
        break
      }
      sent += chunk.length
    }
  } catch (e) {
    error = (e as Error).message
  }

  await db().from('email_log').insert({
    teacher_id: opts.teacher.id,
    kind: opts.kind,
    subject: opts.email.subject,
    body: opts.email.text,
    recipients,
    status: error ? 'failed' : 'sent',
    error: error ?? null,
    lesson_id: opts.lessonId ?? null,
    invoice_id: opts.invoiceId ?? null,
  })

  return { sent, failed: recipients.length - sent, error }
}
