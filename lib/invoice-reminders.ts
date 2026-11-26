// =============================================================================
// lib/invoice-reminders.ts — automatic payment reminders (hourly cron)
//
// For teachers with auto-invoicing ON: every sent, unpaid invoice that is
// OVERDUE_DAYS past its due date gets one reminder email (the same "still
// unpaid" email as the Send reminder button). Only from 9am in the teacher's
// timezone. invoices.auto_reminder_sent_at is set once it has gone out, so
// it's never sent twice; a failed send is retried next hour.
// Teachers with auto-invoicing off send reminders themselves.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { addDaysISO, fmtTz, todayISO } from './dates'
import { sendInvoice } from './invoice-email'
import type { Teacher } from './database.types'

export const OVERDUE_DAYS = 7

export type InvoiceReminderSummary = { teachers: number; sent: number; failed: number }

export async function sendOverdueInvoiceReminders(now = new Date()): Promise<InvoiceReminderSummary> {
  const summary: InvoiceReminderSummary = { teachers: 0, sent: 0, failed: 0 }
  const teachers = must(await db().from('teachers').select('*').eq('auto_invoice', true)) as Teacher[]

  for (const teacher of teachers) {
    if (Number(fmtTz(now.toISOString(), teacher.timezone, 'H')) < 9) continue
    summary.teachers++
    const cutoff = addDaysISO(todayISO(teacher.timezone), -OVERDUE_DAYS)
    const overdue = must(
      await db()
        .from('invoices')
        .select('*')
        .eq('teacher_id', teacher.id)
        .eq('status', 'sent')
        .is('auto_reminder_sent_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', cutoff),
    )
    for (const inv of overdue) {
      const res = await sendInvoice(teacher, inv, { reminder: true })
      if (!res.ok) {
        summary.failed++
        continue
      }
      must(await db().from('invoices').update({ auto_reminder_sent_at: new Date().toISOString() }).eq('id', inv.id).eq('teacher_id', teacher.id).select('id'))
      summary.sent++
    }
  }
  return summary
}
