// =============================================================================
// invoices/page.tsx — Invoices (Hannah's wireframe)
//
// Tiles: Amount due this month · Outstanding. Buttons: New invoice and the
// auto-invoicing switch, plus "Create invoices now" for a manual monthly run.
// A month dropdown (?month=YYYY-MM, default this month) picks which invoices
// are listed: student, amount, status and the next action — send a draft, or
// send a payment reminder for a sent, unpaid one. Drafts can all be sent at once.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName, money } from '@/lib/format'
import { fmtDate, monthBounds, monthOptions, todayISO } from '@/lib/dates'
import { billingMonth, displayStatus } from '@/lib/invoices'
import { has } from '@/lib/features'
import { Card, EmptyState, PageHeader, Stat, StatusBadge, TextField } from '@/components/ui'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { ModalButton } from '@/components/modal'
import { MonthPicker } from '@/components/month-picker'
import { emailInvoice, runMonthlyInvoices, sendInvoiceReminder, sendMonthDrafts, setAutoInvoice } from './actions'

export const metadata: Metadata = { title: 'Invoices' }

export default async function InvoicesPage({ searchParams }: PageProps<'/invoices'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const today = todayISO(teacher.timezone)
  const month = typeof sp.month === 'string' && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7)
  const [from, to] = monthBounds(`${month}-01`)
  const c = teacher.currency
  const arrears = teacher.billing_mode === 'arrears'

  const [invoices, dueThisMonth, unpaid] = await Promise.all([
    // Invoices issued in the chosen month
    db()
      .from('invoices')
      .select('id, number, bill_to_name, bill_to_email, issue_date, due_date, status, total, paid_on, students(first_name, last_name)')
      .eq('teacher_id', teacher.id)
      .gte('issue_date', from)
      .lte('issue_date', to)
      .order('bill_to_name')
      .then(must),
    // Everything (not void) falling due in the chosen month
    db().from('invoices').select('total').eq('teacher_id', teacher.id).neq('status', 'void').gte('due_date', from).lte('due_date', to).then(must),
    db().from('invoices').select('total').eq('teacher_id', teacher.id).eq('status', 'sent').then(must),
  ])
  const sum = (rows: { total: number }[]) => rows.reduce((n, r) => n + Number(r.total), 0)
  const drafts = invoices.filter((i) => i.status === 'draft')
  const isThisMonth = month === today.slice(0, 7)

  return (
    <>
      <PageHeader
        title="Invoices"
        actions={
          <>
            {has(teacher, 'reports') && (
              <Link href="/reports" className="btn btn-ghost">
                Income reports
              </Link>
            )}
            {/* ---- Manual monthly run (the 1st-of-the-month job does this automatically) ---- */}
            <ModalButton label="Create invoices now" title="Create this month’s invoices" className="btn btn-secondary">
              <ActionForm action={runMonthlyInvoices}>
                <p className="small muted" style={{ margin: 0 }}>
                  {arrears
                    ? 'Makes a draft invoice for every active pupil’s lessons in that month that went ahead and aren’t invoiced yet.'
                    : 'Makes a draft invoice for every active pupil’s lessons in that month that aren’t invoiced yet, and takes off any make-up credits waiting.'}{' '}
                  Nothing is sent — check the drafts, then send them. Lindon also does this for you on the 1st of each month.
                </p>
                <div className="form-grid">
                  <TextField label="Month to bill" name="month" type="month" defaultValue={billingMonth(teacher, today).slice(0, 7)} required />
                  <TextField label="Invoice date" name="issue_date" type="date" defaultValue={today} />
                </div>
                <SubmitButton pendingText="Creating invoices…">Create draft invoices</SubmitButton>
              </ActionForm>
            </ModalButton>
            {/* ---- Auto-invoicing switch ---- */}
            {teacher.auto_invoice ? (
              <ConfirmButton
                action={setAutoInvoice.bind(null, false)}
                confirm="Turn off auto-invoicing? Invoices will still be drafted on the 1st, but you'll check and send them yourself."
                className="btn btn-secondary"
              >
                ✓ Auto-invoicing on
              </ConfirmButton>
            ) : (
              <ConfirmButton
                action={setAutoInvoice.bind(null, true)}
                confirm="Turn on auto-invoicing? On the 1st of each month, invoices will be made and emailed to families automatically."
                className="btn btn-secondary"
              >
                Enable auto-invoicing
              </ConfirmButton>
            )}
            <Link href="/invoices/new" className="btn">
              New invoice
            </Link>
          </>
        }
      />

      {/* ---- Tiles ---- */}
      <div className="grid grid-2" style={{ marginBottom: 20 }}>
        <Stat label={isThisMonth ? 'Amount due this month' : `Amount due in ${fmtDate(from, 'MMMM')}`} value={money(sum(dueThisMonth), c)} tone="teal" />
        <Stat label="Outstanding" value={money(sum(unpaid), c)} note={`${unpaid.length} sent invoice${unpaid.length === 1 ? '' : 's'} not paid yet`} tone="butter" />
      </div>

      {/* ---- Month + send drafts ---- */}
      <div className="cal-bar">
        <MonthPicker basePath="/invoices" name="month" label="Invoices issued in" value={month} options={monthOptions(today)} />
        {drafts.length > 0 && (
          <ConfirmButton
            action={sendMonthDrafts.bind(null, month)}
            confirm={`Email all ${drafts.length} draft invoice${drafts.length === 1 ? '' : 's'} for ${fmtDate(from, 'MMMM yyyy')} to families now?`}
            className="btn btn-purple"
          >
            Send all drafts ({drafts.length})
          </ConfirmButton>
        )}
      </div>

      {/* ---- The month's invoices ---- */}
      <Card>
        {invoices.length === 0 ? (
          <EmptyState title="No invoices this month">
            {teacher.auto_invoice
              ? 'Invoices are made and sent automatically on the 1st of each month.'
              : 'On the 1st of each month, invoices are drafted here for you to check and send. You can also make one yourself with “New invoice”.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Student name</th>
                  <th className="right">Amount</th>
                  <th>Invoice status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const status = displayStatus(inv, today)
                  return (
                    <tr key={inv.id}>
                      <td>
                        <Link className="rowlink" href={`/invoices/${inv.id}`}>
                          {inv.students ? fullName(inv.students) : inv.bill_to_name || 'No name'}
                        </Link>
                        <div className="small muted">
                          {inv.number}
                          {inv.students && inv.bill_to_name && inv.bill_to_name !== fullName(inv.students) ? ` · billed to ${inv.bill_to_name}` : ''}
                        </div>
                      </td>
                      <td className="right nowrap">{money(inv.total, c)}</td>
                      <td>
                        <StatusBadge status={status} />
                        {inv.status === 'paid' && inv.paid_on && <div className="small muted">{fmtDate(inv.paid_on, 'd MMM')}</div>}
                        {inv.status === 'sent' && inv.due_date && <div className="small muted">Due {fmtDate(inv.due_date, 'd MMM')}</div>}
                      </td>
                      <td className="right">
                        {inv.status === 'draft' ? (
                          <ConfirmButton
                            action={emailInvoice.bind(null, inv.id)}
                            confirm={`Email invoice ${inv.number} to ${inv.bill_to_email || 'the family'}?`}
                            className="btn btn-sm"
                          >
                            Send invoice
                          </ConfirmButton>
                        ) : inv.status === 'sent' ? (
                          <ConfirmButton
                            action={sendInvoiceReminder.bind(null, inv.id)}
                            confirm={`Email a payment reminder for ${inv.number} to ${inv.bill_to_email || 'the family'}?`}
                            className="btn btn-secondary btn-sm"
                          >
                            Send reminder
                          </ConfirmButton>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
