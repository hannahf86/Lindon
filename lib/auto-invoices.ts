// =============================================================================
// lib/auto-invoices.ts — the monthly invoice run, called by the hourly cron
//
// From the 1st of each month (in each teacher's own timezone), drafts an
// invoice for every active pupil via createMonthlyInvoices(): this month's
// lessons for teachers billing in advance, last month's for those billing in
// arrears (lib/invoices.ts → billingMonth). Teachers with auto-invoicing on get them emailed
// straight away; otherwise they stay as drafts to check and send. A student
// with their own auto-invoicing switched off (students.auto_invoice) always
// stays as a draft, even when the teacher's overall setting is on.
// last_invoice_run is set before sending, so a month is never run twice even
// if an email fails — failed ones stay as drafts for the teacher.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { todayISO } from './dates'
import { createMonthlyInvoices } from './monthly-invoices'
import { billingMonth } from './invoices'
import { sendInvoice } from './invoice-email'

export type AutoInvoiceSummary = { teachers: number; drafted: number; emailed: number; errors: string[] }

export async function runAutoInvoices(): Promise<AutoInvoiceSummary> {
  const summary: AutoInvoiceSummary = { teachers: 0, drafted: 0, emailed: 0, errors: [] }
  const teachers = must(await db().from('teachers').select('*'))

  for (const teacher of teachers) {
    const today = todayISO(teacher.timezone)
    const month = today.slice(0, 7)
    if (teacher.last_invoice_run >= month) continue
    try {
      // Claim the month first (only one run wins if two overlap)
      const claimed = must(
        await db()
          .from('teachers')
          .update({ last_invoice_run: month })
          .eq('id', teacher.id)
          .lt('last_invoice_run', month)
          .select('id'),
      )
      if (claimed.length === 0) continue
      summary.teachers++

      const run = await createMonthlyInvoices(teacher, billingMonth(teacher, today), today)
      summary.drafted += run.created.length
      if (!teacher.auto_invoice) continue

      // Students switched out of auto-invoicing keep their invoice as a draft
      const optedOut = new Set(
        must(await db().from('students').select('id').eq('teacher_id', teacher.id).eq('auto_invoice', false)).map((s) => s.id),
      )
      for (const c of run.created) {
        const { data: inv } = await db().from('invoices').select('*').eq('id', c.invoiceId).eq('teacher_id', teacher.id).single()
        if (!inv) continue
        if (inv.student_id && optedOut.has(inv.student_id)) continue
        const sent = await sendInvoice(teacher, inv)
        if (sent.ok) summary.emailed++
        else summary.errors.push(`${c.number}: ${sent.error}`)
      }
    } catch (e) {
      // One teacher's problem shouldn't stop everyone else's invoices
      summary.errors.push((e as Error).message)
    }
  }
  return summary
}
