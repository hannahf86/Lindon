'use client'
// =============================================================================
// invoices/invoice-row-actions.tsx — quick actions on each invoice in the list
// (like the attendance list: one main button, plus a dropdown for the rest)
//
//   Draft  → [Send invoice]           ▾ Mark as paid · Mark as sent (no email) · Delete
//   Sent   → [Mark paid]              ▾ Send reminder · Void
//   Paid   → ✓ Paid                   ▾ Undo — mark unpaid
//   Void   →                          ▾ Delete invoice
// Anything that emails a family asks first. "Mark paid" records today's date;
// a different date or payment method can be set on the invoice page.
// =============================================================================
import { startTransition, useState } from 'react'
import type { ActionState } from '@/lib/forms'
import type { InvoiceStatus } from '@/lib/database.types'
import { deleteInvoice, emailInvoice, markPaidToday, markSent, markUnpaid, sendInvoiceReminder, voidInvoice } from './actions'

type Option = { key: string; label: string; run: () => Promise<ActionState>; confirm?: string }

export function InvoiceRowActions(props: { id: string; number: string; status: InvoiceStatus; email: string; paidLabel?: string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<ActionState>(null)
  const to = props.email || 'the family'

  const go = (o: Option) => {
    if (o.confirm && !window.confirm(o.confirm)) return
    setBusy(true)
    startTransition(async () => {
      setMsg(await o.run())
      setBusy(false)
    })
  }

  // ---- Main button + dropdown options per status ----
  const send: Option = { key: 'send', label: 'Send invoice', run: () => emailInvoice(props.id), confirm: `Email invoice ${props.number} to ${to}?` }
  const paid: Option = { key: 'paid', label: 'Mark paid', run: () => markPaidToday(props.id) }
  const reminder: Option = { key: 'reminder', label: 'Send reminder', run: () => sendInvoiceReminder(props.id), confirm: `Email a payment reminder for ${props.number} to ${to}?` }
  const sentNoEmail: Option = { key: 'sent', label: 'Mark as sent (no email)', run: () => markSent(props.id) }
  const voided: Option = { key: 'void', label: 'Void invoice', run: () => voidInvoice(props.id), confirm: `Void invoice ${props.number}? It stays on record but no longer counts, and its lessons can be billed again.` }
  const undo: Option = { key: 'undo', label: 'Undo — mark unpaid', run: () => markUnpaid(props.id) }
  const del: Option = { key: 'delete', label: 'Delete invoice', run: () => deleteInvoice(props.id), confirm: `Delete invoice ${props.number} for good? Any lessons on it can be invoiced again. This can’t be undone.` }

  const main = props.status === 'draft' ? send : props.status === 'sent' ? paid : null
  const more: Option[] =
    props.status === 'draft'
      ? [{ ...paid, label: 'Mark as paid' }, sentNoEmail, del]
      : props.status === 'sent'
        ? [reminder, voided]
        : props.status === 'paid'
          ? [undo]
          : [del] // void

  return (
    <div className="inv-actions">
      <div className="inv-actions-row">
        {main ? (
          <button type="button" className={`btn btn-sm ${props.status === 'draft' ? '' : 'btn-secondary'}`} disabled={busy} onClick={() => go(main)}>
            {busy ? '…' : main.label}
          </button>
        ) : props.status === 'paid' ? (
          <span className="btn btn-sm att-current">✓ Paid{props.paidLabel ? ` ${props.paidLabel}` : ''}</span>
        ) : null}
        {more.length > 0 && (
          <select
            className="input input-sm"
            aria-label={`More for invoice ${props.number}`}
            value=""
            disabled={busy}
            onChange={(e) => {
              const o = more.find((x) => x.key === e.target.value)
              if (o) go(o)
            }}
          >
            <option value="">More…</option>
            {more.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {msg?.error && (
        <div className="small" role="alert" style={{ color: 'var(--coral-ink)' }}>
          {msg.error}
        </div>
      )}
      {msg?.ok && (
        <div className="small" role="status" style={{ color: 'var(--teal-deep)' }}>
          {msg.ok}
        </div>
      )}
    </div>
  )
}
