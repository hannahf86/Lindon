// =============================================================================
// app/family/invoices/[id]/page.tsx — one invoice, ready to read or print
//
// The invoice is looked up under each of the person's own links (teacher +
// visible pupils, sent/paid only), so an id for anyone else's invoice — or a
// draft / void one — is simply "not found". Prints cleanly as A4.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, must } from '@/lib/db'
import { requireFamily, type FamilyContext } from '@/lib/family'
import { fullName, money } from '@/lib/format'
import { fmtDate, todayISO } from '@/lib/dates'
import { displayStatus } from '@/lib/invoices'
import { StatusBadge } from '@/components/ui'
import { PrintButton } from './print-button'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The invoice + the link it belongs to, or null if this person can't see it. */
async function findInvoice(ctx: FamilyContext, id: string) {
  if (!UUID.test(id)) return null
  for (const link of ctx.links) {
    if (link.studentIds.length === 0) continue
    const { data } = await db()
      .from('invoices')
      .select('id, number, student_id, bill_to_name, bill_to_email, bill_to_address, issue_date, due_date, status, paid_on, payment_method, notes, total')
      .eq('id', id)
      .eq('teacher_id', link.teacher.id)
      .in('student_id', link.studentIds)
      .in('status', ['sent', 'paid'])
      .maybeSingle()
    if (data) return { inv: data, link }
  }
  return null
}

export async function generateMetadata({ params }: PageProps<'/family/invoices/[id]'>): Promise<Metadata> {
  const { id } = await params
  const found = await findInvoice(await requireFamily(), id)
  // The title becomes the suggested file name when saving as PDF
  return { title: found ? `Invoice ${found.inv.number}` : 'Invoice' }
}

// Print-only page setup: A4 with sensible margins
const PAGE_CSS = `@page { size: A4; margin: 16mm; }
.invoice-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print { .invoice-sheet { max-width: none !important; margin: 0 !important; box-shadow: none !important; padding: 0 !important; } }
@media (max-width: 700px) { .invoice-sheet { padding: 24px 18px !important; } }`

export default async function FamilyInvoicePage({ params }: PageProps<'/family/invoices/[id]'>) {
  const { id } = await params
  const ctx = await requireFamily()
  const found = await findInvoice(ctx, id)
  if (!found) notFound()
  const { inv, link } = found
  const t = link.teacher
  const c = t.currency

  const [items, extra] = await Promise.all([
    db()
      .from('invoice_items')
      .select('id, description, quantity, unit_price, amount')
      .eq('teacher_id', t.id)
      .eq('invoice_id', inv.id)
      .order('position')
      .order('created_at')
      .then(must),
    db().from('teachers').select('address, invoice_footer').eq('id', t.id).maybeSingle(),
  ])

  const studio = t.business_name || t.display_name || 'Music lessons'
  const pupil = link.pupils.find((p) => p.id === inv.student_id)
  const pupilName = pupil ? fullName(pupil) : ''
  const status = displayStatus(inv, todayISO(t.timezone))
  const showQty = items.some((it) => Number(it.quantity) !== 1)

  return (
    <>
      <style>{PAGE_CSS}</style>

      {/* ---- Toolbar (screen only) ---- */}
      <div className="spread no-print" style={{ marginBottom: 20 }}>
        <Link className="back" href="/family/invoices">
          ← All invoices
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
            {t.business_name && t.display_name && <div>{t.display_name}</div>}
            {extra.data?.address && <div className="small" style={{ whiteSpace: 'pre-line' }}>{extra.data.address}</div>}
            <div className="small">{[t.email, t.phone].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow">Invoice</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{inv.number}</div>
            {inv.status === 'paid' && (
              <div style={{ marginTop: 6, fontWeight: 900, color: 'var(--teal-ink)', border: '3px solid var(--teal-ink)', borderRadius: 10, padding: '2px 12px', display: 'inline-block' }}>
                PAID
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
            {pupilName && pupilName !== inv.bill_to_name && <div className="small" style={{ marginTop: 6 }}>Pupil: {pupilName}</div>}
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
                  <td style={{ fontWeight: 800, textAlign: 'right', color: status === 'overdue' ? 'var(--coral-ink)' : undefined }}>
                    {fmtDate(inv.due_date, 'd MMMM yyyy')}
                  </td>
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
        <div className="table-wrap" style={{ marginBottom: 24 }}>
          <table className="table">
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
        </div>

        {/* Notes, how to pay, footer */}
        {inv.notes && <p style={{ whiteSpace: 'pre-line' }}>{inv.notes}</p>}
        {inv.status === 'paid' ? (
          <section style={{ background: 'var(--teal-wash)', borderRadius: 14, padding: '14px 18px', margin: '16px 0', breakInside: 'avoid' }}>
            <div style={{ fontWeight: 900 }}>Paid — thank you!</div>
          </section>
        ) : (
          <section style={{ background: 'var(--teal-wash)', borderRadius: 14, padding: '14px 18px', margin: '16px 0', breakInside: 'avoid' }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>How to pay</div>
            {t.payment_details ? (
              <div style={{ whiteSpace: 'pre-line' }}>{t.payment_details}</div>
            ) : (
              <div>Please check with your teacher how they’d like to be paid.</div>
            )}
            <div className="small" style={{ marginTop: 6 }}>Please use {inv.number} as the payment reference.</div>
          </section>
        )}
        {extra.data?.invoice_footer && (
          <footer className="small muted" style={{ whiteSpace: 'pre-line', marginTop: 28, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
            {extra.data.invoice_footer}
          </footer>
        )}
      </article>
    </>
  )
}
