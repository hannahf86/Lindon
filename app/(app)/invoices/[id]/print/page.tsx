// =============================================================================
// invoices/[id]/print/page.tsx — clean, A4-friendly invoice for printing or
// saving as a PDF. The app sidebar and the toolbar are hidden when printing
// (.no-print + the print styles in globals.css).
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName, money } from '@/lib/format'
import { fmtDate, todayISO } from '@/lib/dates'
import { studioName } from '@/lib/email'
import { displayStatus } from '@/lib/invoices'
import { StatusBadge } from '@/components/ui'
import { PrintButton } from './print-button'

export async function generateMetadata({ params }: PageProps<'/invoices/[id]/print'>): Promise<Metadata> {
  const { id } = await params
  const teacher = await requireTeacher()
  const { data } = await db().from('invoices').select('number').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
  // The title becomes the suggested file name when saving as PDF
  return { title: data ? `Invoice ${data.number}` : 'Invoice' }
}

// Print-only page setup: A4 with sensible margins
const PAGE_CSS = `@page { size: A4; margin: 16mm; }
.invoice-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print { .invoice-sheet { max-width: none !important; margin: 0 !important; box-shadow: none !important; padding: 0 !important; } }`

export default async function PrintInvoicePage({ params }: PageProps<'/invoices/[id]/print'>) {
  const { id } = await params
  const teacher = await requireTeacher()
  const c = teacher.currency

  const { data: inv } = await db()
    .from('invoices')
    .select('*, students(first_name, last_name)')
    .eq('id', id)
    .eq('teacher_id', teacher.id)
    .maybeSingle()
  if (!inv) notFound()
  const items = must(
    await db().from('invoice_items').select('*').eq('teacher_id', teacher.id).eq('invoice_id', id).order('position').order('created_at'),
  )

  const studio = studioName(teacher)
  const studentName = inv.students ? fullName(inv.students) : ''
  const status = displayStatus(inv, todayISO(teacher.timezone))
  const showQty = items.some((it) => Number(it.quantity) !== 1)

  return (
    <>
      <style>{PAGE_CSS}</style>

      {/* ---- Toolbar (screen only) ---- */}
      <div className="spread no-print" style={{ marginBottom: 20 }}>
        <Link className="back" href={`/invoices/${id}`}>
          ← Back to invoice
        </Link>
        <span className="row">
          <StatusBadge status={status} />
          <PrintButton />
        </span>
      </div>

      {/* ---- The invoice sheet ---- */}
      <article
        className="invoice-sheet"
        style={{ background: '#fff', maxWidth: 800, margin: '0 auto', padding: '48px 52px', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', color: 'var(--ink)' }}
      >
        {/* Studio + invoice number */}
        <header className="spread" style={{ alignItems: 'flex-start', borderBottom: '6px solid var(--butter)', paddingBottom: 20, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--teal-ink)' }}>{studio}</div>
            {teacher.business_name && teacher.display_name && <div>{teacher.display_name}</div>}
            {teacher.address && <div className="small" style={{ whiteSpace: 'pre-line' }}>{teacher.address}</div>}
            <div className="small">{[teacher.email, teacher.phone].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow">Invoice</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{inv.number}</div>
            {inv.status === 'paid' && (
              <div style={{ marginTop: 6, fontWeight: 900, color: 'var(--teal-ink)', border: '3px solid var(--teal-ink)', borderRadius: 10, padding: '2px 12px', display: 'inline-block' }}>
                PAID
              </div>
            )}
            {inv.status === 'void' && (
              <div style={{ marginTop: 6, fontWeight: 900, color: 'var(--coral-ink)', border: '3px solid var(--coral-ink)', borderRadius: 10, padding: '2px 12px', display: 'inline-block' }}>
                VOID
              </div>
            )}
          </div>
        </header>

        {/* Bill-to + dates */}
        <section className="spread" style={{ alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <div className="eyebrow">Bill to</div>
            <div style={{ fontWeight: 800 }}>{inv.bill_to_name}</div>
            {inv.bill_to_address && <div style={{ whiteSpace: 'pre-line' }}>{inv.bill_to_address}</div>}
            {inv.bill_to_email && <div className="small">{inv.bill_to_email}</div>}
            {studentName && studentName !== inv.bill_to_name && <div className="small" style={{ marginTop: 6 }}>Student: {studentName}</div>}
          </div>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td className="muted" style={{ paddingRight: 16 }}>Issued</td>
                <td style={{ fontWeight: 800, textAlign: 'right' }}>{fmtDate(inv.issue_date, 'd MMMM yyyy')}</td>
              </tr>
              {inv.due_date && (
                <tr>
                  <td className="muted" style={{ paddingRight: 16 }}>Due</td>
                  <td style={{ fontWeight: 800, textAlign: 'right' }}>{fmtDate(inv.due_date, 'd MMMM yyyy')}</td>
                </tr>
              )}
              {inv.status === 'paid' && inv.paid_on && (
                <tr>
                  <td className="muted" style={{ paddingRight: 16 }}>Paid</td>
                  <td style={{ fontWeight: 800, textAlign: 'right' }}>
                    {fmtDate(inv.paid_on, 'd MMMM yyyy')}
                    {inv.payment_method && ` (${inv.payment_method})`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Lines */}
        <table className="table" style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <th>Description</th>
              {showQty && <th className="right">Qty</th>}
              {showQty && <th className="right">Price</th>}
              <th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.description}</td>
                {showQty && <td className="right">{Number(it.quantity)}</td>}
                {showQty && <td className="right nowrap">{money(it.unit_price, c)}</td>}
                <td className="right nowrap">{money(it.amount, c)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={showQty ? 4 : 2} className="muted">
                  No items.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={showQty ? 3 : 1} style={{ fontSize: '1.1rem' }}>
                Total
              </td>
              <td className="right nowrap" style={{ fontSize: '1.3rem', color: 'var(--teal-ink)' }}>
                {money(inv.total, c)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Notes, how to pay, footer */}
        {inv.notes && <p style={{ whiteSpace: 'pre-line' }}>{inv.notes}</p>}
        {teacher.payment_details && inv.status !== 'paid' && (
          <section style={{ background: 'var(--teal-wash)', borderRadius: 14, padding: '14px 18px', margin: '16px 0', breakInside: 'avoid' }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>How to pay</div>
            <div style={{ whiteSpace: 'pre-line' }}>{teacher.payment_details}</div>
            <div className="small" style={{ marginTop: 6 }}>Please use {inv.number} as the payment reference.</div>
          </section>
        )}
        {teacher.invoice_footer && (
          <footer className="small muted" style={{ whiteSpace: 'pre-line', marginTop: 28, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
            {teacher.invoice_footer}
          </footer>
        )}
      </article>
    </>
  )
}
