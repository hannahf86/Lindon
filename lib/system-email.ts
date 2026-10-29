// =============================================================================
// lib/system-email.ts — emails from Lindon itself (not from a teacher)
//
// Access-request notifications and "you're in" approvals. Unlike lib/email.ts
// these aren't tied to a teacher, so they aren't written to email_log.
// Never throws — returns an error message for the caller to show.
// =============================================================================
import 'server-only'
import { Resend } from 'resend'
import type { Email } from './email-templates'

export async function sendSystemEmail(to: string[], email: Email): Promise<string | undefined> {
  const key = process.env.AUTH_RESEND_KEY
  if (!key) return 'Email is switched off (no AUTH_RESEND_KEY).'
  const configured = process.env.EMAIL_FROM ?? 'onboarding@resend.dev'
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured
  try {
    const { error } = await new Resend(key).emails.send({ from: `"Lindon" <${address}>`, to, subject: email.subject, html: email.html, text: email.text })
    return error ? error.message : undefined
  } catch (e) {
    return (e as Error).message
  }
}
