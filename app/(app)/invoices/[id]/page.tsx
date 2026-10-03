// =============================================================================
// invoices/[id]/page.tsx — one invoice: status actions (email, sent, paid,
// void, reopen), bill-to & dates, line items, payment details and delete.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName, money } from '@/lib/format'
import { fmtDate, fmtTz, monthBounds, todayISO } from '@/lib/dates'
import { displayStatus, isEditable } from '@/lib/invoices'
import { productOptions } from '@/lib/products'
import { availableCredits } from '@/lib/credits'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Card, PageHeader, StatusBadge, TextArea, TextField } from '@/components/ui'
import { InvoiceItems } from './invoice-items'
import { applyCreditsAction, deleteInvoice, emailInvoice, markPaid, markSent, reopenInvoice, updateInvoice, voidInvoice } from '../actions'

export const metadata: Metadata = { title: 'Invoice' }

export default async function InvoicePage({ params, searchParams }: PageProps<'/invoices/[id]'>) {
  const { id } = await params
  const sp = await searchParams
  const teacher = await requireTeacher()
  const tz = teacher.timezone
  const c = teacher.currency

  const { data: inv } = await db()
    .from('invoices')
    .select('*, students(id, first_name, last_name)')
    .eq('id', id)
    .eq('teacher_id', teacher.id)
    .maybeSingle()
  if (!inv) notFound()

  const [items, emails] = await Promise.all([
    db().from('invoice_items').select('*').eq('teacher_id', teacher.id).eq('invoice_id', id).order('position').order('created_at').then(must),
    db()
      .from('email_log')
      .select('id, created_at, recipients, status, error')
      .eq('teacher_id', teacher.id)
      .eq('invoice_id', id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(must),
  ])

  const today = todayISO(tz)
  const status = displayStatus(inv, today)
  const editable = isEditable(inv)
  // Unused make-up credits (offered while the invoice can still be edited)
  const waitingCredits = editable && inv.student_id ? await availableCredits(teacher.id, inv.student_id) : []
  const student = inv.students

  return (
    <>
      <PageHeader
        title={`Invoice ${inv.number}`}
        back={{ href: '/invoices', label: 'Invoices' }}
        subtitle={
          <span className="row" style={{ gap: 6 }}>
            <StatusBadge status={status} />
            <span>{money(inv.total, c)}</span>
            {inv.bill_to_name && <span>· {inv.bill_to_name}</span>}
            {student && (
              <span>
                · for <Link href={`/students/${student.id}`}>{fullName(student)}</Link>
              </span>
            )}
          </span>
        }
        actions={
          <Link className="btn btn-secondary" href={`/invoices/${id}/print`}>
            Print / PDF
          </Link>
        }
      />

      {sp.new === '1' && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          Invoice created as a draft{items.length ? ` with ${items.length} item${items.length === 1 ? '' : 's'}` : ''}. Check it over, add any
          equipment, then email it or print it.
        </div>
      )}

      <div className="split">
        <div className="stack">
          {/* ---- Make-up credits waiting for this pupil ---- */}
          {waitingCredits.length > 0 && (
            <div className="alert alert-info spread">
              <span>
                {student?.first_name ?? 'This pupil'} has {waitingCredits.length} make-up credit{waitingCredits.length === 1 ? '' : 's'} waiting (
                {money(waitingCredits.reduce((n, cr) => n + Number(cr.amount), 0), c)}).
              </span>
              <ActionForm action={applyCreditsAction.bind(null, id)} className="row">
                <SubmitButton className="btn btn-sm" pendingText="Applying…">
                  Take off this invoice
                </SubmitButton>
              </ActionForm>
            </div>
          )}

          {/* ---- Line items + add forms ---- */}
          <InvoiceItems
            invoiceId={id}
            items={items}
            total={Number(inv.total)}
            currency={c}
            editable={editable}
            hasStudent={!!inv.student_id}
            lessonPeriod={monthBounds(inv.issue_date)}
            products={editable ? await productOptions(teacher) : undefined}
          />

          {/* ---- Bill-to, dates and notes ---- */}
          <Card title="Invoice details">
            {editable ? (
              <ActionForm action={updateInvoice.bind(null, id)}>
                <div className="form-grid">
                  <TextField label="Bill to" name="bill_to_name" defaultValue={inv.bill_to_name} required />
                  <TextField label="Email" name="bill_to_email" type="email" defaultValue={inv.bill_to_email} hint="Where the invoice is emailed." />
                  <TextArea label="Address" name="bill_to_address" defaultValue={inv.bill_to_address} wrapClass="full" style={{ minHeight: 80 }} />
                  <TextField label="Issue date" name="issue_date" type="date" defaultValue={inv.issue_date} required />
                  <TextField label="Due date" name="due_date" type="date" defaultValue={inv.due_date ?? ''} />
                  <TextArea label="Note on the invoice" name="notes" defaultValue={inv.notes} wrapClass="full" hint="Optional — e.g. “Thank you! Autumn term fees.”" />
                </div>
                <div className="form-actions">
                  <SubmitButton>Save details</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <>
                <ul className="list">
                  <li>
                    <strong>{inv.bill_to_name || 'No name'}</strong>
                    {inv.bill_to_email && <div className="small">{inv.bill_to_email}</div>}
                    {inv.bill_to_address && <div className="small" style={{ whiteSpace: 'pre-line' }}>{inv.bill_to_address}</div>}
                  </li>
                  <li>
                    Issued {fmtDate(inv.issue_date)}
                    {inv.due_date && ` · due ${fmtDate(inv.due_date)}`}
                  </li>
                  {inv.notes && <li style={{ whiteSpace: 'pre-line' }}>{inv.notes}</li>}
                </ul>
                <p className="small muted">This invoice is {inv.status}. Reopen it as a draft if you need to change anything.</p>
              </>
            )}
          </Card>
        </div>

        <div className="stack">
          {/* ---- Status & sending ---- */}
          <Card title="Status">
            <div className="stack" style={{ gap: 12 }}>
              <div>
                <StatusBadge status={status} />
                {inv.sent_at && <div className="small muted" style={{ marginTop: 6 }}>Sent {fmtTz(inv.sent_at, tz, 'd MMM yyyy, HH:mm')}</div>}
                {inv.status === 'paid' && (
                  <div className="small" style={{ marginTop: 6 }}>
                    Paid {inv.paid_on ? fmtDate(inv.paid_on) : ''}
                    {inv.payment_method && ` · ${inv.payment_method}`}
                  </div>
                )}
              </div>

              {/* Email */}
              {inv.status !== 'void' && (
                <div>
                  <ConfirmButton
                    action={emailInvoice.bind(null, id)}
                    confirm={
                      inv.bill_to_email
                        ? `Email invoice ${inv.number} to ${inv.bill_to_email}?`
                        : 'There’s no email address on this invoice yet — add one under “Invoice details” first.'
                    }
                    className="btn"
                  >
                    {inv.status === 'draft' ? 'Email invoice' : inv.status === 'paid' ? 'Email receipt copy' : 'Email again'}
                  </ConfirmButton>
                  {!inv.bill_to_email && <div className="small muted" style={{ marginTop: 6 }}>No email address yet.</div>}
                </div>
              )}

              {/* Sent without emailing (e.g. handed over in person) */}
              {inv.status === 'draft' && (
                <ConfirmButton
                  action={markSent.bind(null, id)}
                  confirm="Mark as sent without emailing it? (Use this if you’ve printed it or sent it another way.)"
                  className="btn btn-secondary"
                >
                  Mark as sent
                </ConfirmButton>
              )}

              {/* Record a payment */}
              {(inv.status === 'draft' || inv.status === 'sent') && (
                <details open={inv.status === 'sent'}>
                  <summary className="btn btn-secondary btn-sm">Mark as paid</summary>
                  <div style={{ marginTop: 12 }}>
                    <ActionForm action={markPaid.bind(null, id)}>
                      <TextField label="Paid on" name="paid_on" type="date" defaultValue={today} />
                      <TextField label="How they paid" name="payment_method" placeholder="e.g. Bank transfer, Cash" />
                      <SubmitButton>Record payment</SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              )}

              {/* Undo / cancel */}
              <div className="row" style={{ gap: 6 }}>
                {inv.status !== 'draft' && (
                  <ConfirmButton
                    action={reopenInvoice.bind(null, id)}
                    confirm={`Reopen ${inv.number} as a draft so you can edit it?${inv.status === 'paid' ? ' The payment record will be cleared.' : ''}`}
                    className="btn btn-ghost btn-sm"
                  >
                    Reopen as draft
                  </ConfirmButton>
                )}
                {inv.status !== 'void' && inv.status !== 'draft' && (
                  <ConfirmButton
                    action={voidInvoice.bind(null, id)}
                    confirm={`Void ${inv.number}? It stays on record but won’t count as income, and its lessons can be invoiced again.`}
                    className="btn btn-danger btn-sm"
                  >
                    Void
                  </ConfirmButton>
                )}
              </div>
            </div>
          </Card>

          {/* ---- What the invoice says about paying ---- */}
          <Card title="Payment details">
            {teacher.payment_details ? (
              <p style={{ whiteSpace: 'pre-line', margin: 0 }}>{teacher.payment_details}</p>
            ) : (
              <p className="muted" style={{ margin: 0 }}>
                No payment details yet. Add your bank details in <Link href="/settings">Settings</Link> so they appear on every invoice.
              </p>
            )}
            {teacher.invoice_footer && (
              <p className="small muted" style={{ whiteSpace: 'pre-line', marginBottom: 0 }}>
                {teacher.invoice_footer}
              </p>
            )}
          </Card>

          {/* ---- Email history ---- */}
          {emails.length > 0 && (
            <Card title="Emails sent">
              <ul className="list">
                {emails.map((e) => (
                  <li key={e.id} className="small">
                    <strong>{fmtTz(e.created_at, tz, 'd MMM yyyy, HH:mm')}</strong> · {e.recipients.join(', ')}
                    {e.status === 'failed' && <div style={{ color: 'var(--coral-ink)' }}>Didn’t send: {e.error}</div>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ---- Danger zone (drafts only) ---- */}
          {inv.status === 'draft' && (
            <Card>
              <ConfirmButton
                action={deleteInvoice.bind(null, id)}
                confirm={`Delete draft ${inv.number}? Any lessons on it can be invoiced again. This can’t be undone.`}
              >
                Delete draft
              </ConfirmButton>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
