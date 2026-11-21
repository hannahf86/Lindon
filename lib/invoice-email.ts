// =============================================================================
// lib/invoice-email.ts — email an invoice (or a payment reminder for it)
//
// Shared by the invoice buttons and the monthly auto-invoicing job. Sends to
// the invoice's bill-to email; a draft becomes "sent" once it has gone out.
// Never sends a void invoice, one with no lines, or one with no email address.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { money } from './format'
import { fmtDate } from './dates'
import { sendEmail, signature, studioName } from './email'
import { invoiceEmail } from './email-templates'
import type { Invoice, Teacher } from './database.types'

export type InvoiceSendResult = { ok: true; to: string } | { ok: false; error: string }

export async function sendInvoice(teacher: Teacher, inv: Invoice, opts: { reminder?: boolean } = {}): Promise<InvoiceSendResult> {
  if (inv.status === 'void') return { ok: false, error: 'This invoice is void, so it can’t be emailed.' }
  if (opts.reminder && inv.status !== 'sent') return { ok: false, error: 'Reminders are only for sent invoices that haven’t been paid.' }
  if (!inv.bill_to_email) return { ok: false, error: 'Add an email address under “Bill to” first.' }
  const items = must(
    await db().from('invoice_items').select('*').eq('teacher_id', teacher.id).eq('invoice_id', inv.id).order('position').order('created_at'),
  )
  if (items.length === 0) return { ok: false, error: 'Add at least one item before emailing the invoice.' }

  const c = teacher.currency
  const paid = inv.status === 'paid'
  const email = invoiceEmail({
    studio: studioName(teacher),
    number: inv.number,
    billTo: inv.bill_to_name,
    issueDate: fmtDate(inv.issue_date, 'd MMMM yyyy'),
    dueDate: inv.due_date ? fmtDate(inv.due_date, 'd MMMM yyyy') : '',
    lines: items.map((it) => ({
      description: Number(it.quantity) === 1 ? it.description : `${it.description} (${Number(it.quantity)} × ${money(it.unit_price, c)})`,
      amount: money(it.amount, c),
    })),
    total: money(inv.total, c),
    paymentDetails: paid ? '' : teacher.payment_details,
    notes: paid ? [`Paid with thanks${inv.paid_on ? ` on ${fmtDate(inv.paid_on, 'd MMMM yyyy')}` : ''}.`, inv.notes].filter(Boolean).join('\n\n') : inv.notes,
    footer: teacher.invoice_footer,
    signature: signature(teacher),
    reminder: opts.reminder,
  })

  const res = await sendEmail({ teacher, to: [inv.bill_to_email], email, kind: 'invoice', invoiceId: inv.id })
  if (res.error || res.sent === 0) return { ok: false, error: `The email didn’t send: ${res.error ?? 'unknown problem'}.` }

  if (inv.status === 'draft') {
    must(
      await db()
        .from('invoices')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', inv.id)
        .eq('teacher_id', teacher.id)
        .select('id'),
    )
  }
  return { ok: true, to: inv.bill_to_email }
}
