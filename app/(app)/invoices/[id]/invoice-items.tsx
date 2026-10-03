// =============================================================================
// invoices/[id]/invoice-items.tsx — the invoice's lines
//
// Editable invoices (draft / sent): each line is its own small form (description,
// quantity, price, kind) with Save and Remove, plus an "Add item" form and an
// "Add uninvoiced lessons" form underneath.
// Locked invoices (paid / void): a plain read-only table.
// =============================================================================
import type { InvoiceItem } from '@/lib/database.types'
import { money } from '@/lib/format'
import { KIND_OPTIONS } from '@/lib/invoices'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Badge, Card, MoneyField, Segmented, TextField } from '@/components/ui'
import { addItem, addUninvoicedLessons, deleteItem, updateItem } from '../actions'
import { addProductToInvoice } from '@/app/(app)/equipment/actions'
import { Picker, type PickerOption } from '@/components/pickers'

const KIND_TONES = { lesson: 'sky', equipment: 'butter', other: 'purple', credit: 'teal' } as const
const kindLabel = (k: string) => (k === 'credit' ? 'Make-up credit' : KIND_OPTIONS.find((o) => o.value === k)?.label)

/** Currency symbol for the money inputs (e.g. "£" for GBP). */
function symbolFor(currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '£'
  } catch {
    return currency
  }
}

export function InvoiceItems(props: {
  invoiceId: string
  items: InvoiceItem[]
  total: number
  currency: string
  editable: boolean
  hasStudent: boolean
  lessonPeriod: [string, string]
  /** Equipment the teacher sells — shown as a quick "add from your list" form */
  products?: PickerOption[]
}) {
  const { invoiceId, items, currency: c } = props
  const symbol = symbolFor(c)

  return (
    <>
      {/* ---- Lines ---- */}
      <Card title="Items">
        {items.length === 0 && <p className="muted">No items yet. Add lessons or equipment below.</p>}

        {/* Read-only table for paid / void invoices */}
        {!props.editable && items.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Type</th>
                  <th className="right">Qty</th>
                  <th className="right">Price</th>
                  <th className="right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.description}</td>
                    <td>
                      <Badge tone={KIND_TONES[it.kind]}>{kindLabel(it.kind)}</Badge>
                    </td>
                    <td className="right">{Number(it.quantity)}</td>
                    <td className="right nowrap">{money(it.unit_price, c)}</td>
                    <td className="right nowrap">{money(it.amount, c)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total</td>
                  <td className="right nowrap">{money(props.total, c)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Inline edit forms for draft / sent invoices */}
        {props.editable && items.length > 0 && (
          <ul className="list">
            {items.map((it) =>
              it.kind === 'credit' ? (
                /* Make-up credit lines aren't edited — remove one and the credit goes back to the pupil's balance */
                <li key={it.id} className="spread">
                  <span>
                    <Badge tone="teal">Make-up credit</Badge> {it.description} · <strong>{money(it.amount, c)}</strong>
                  </span>
                  <ConfirmButton
                    action={deleteItem.bind(null, invoiceId, it.id)}
                    confirm="Take this credit off the invoice? It goes back to the pupil's credit balance for a later invoice."
                    className="btn btn-ghost btn-sm"
                  >
                    Remove
                  </ConfirmButton>
                </li>
              ) : (
              <li key={it.id}>
                <ActionForm action={updateItem.bind(null, invoiceId, it.id)}>
                  <TextField label="Description" name="description" id={`desc-${it.id}`} defaultValue={it.description} required />
                  <div className="row" style={{ alignItems: 'flex-end' }}>
                    <div style={{ width: 90 }}>
                      <TextField label="Qty" name="quantity" id={`qty-${it.id}`} defaultValue={String(Number(it.quantity))} inputMode="decimal" />
                    </div>
                    <div style={{ width: 130 }}>
                      <MoneyField label="Price each" name="unit_price" id={`price-${it.id}`} symbol={symbol} defaultValue={Number(it.unit_price).toFixed(2)} />
                    </div>
                    <Segmented label="Type" name="kind" options={KIND_OPTIONS} defaultValue={it.kind} />
                  </div>
                  <div className="spread">
                    <span>
                      <span className="muted small">Amount </span>
                      <strong>{money(it.amount, c)}</strong>
                      {it.lesson_id && <span className="small muted"> · linked to a lesson</span>}
                    </span>
                    <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
                  </div>
                </ActionForm>
                {/* Kept outside the edit form — forms can't be nested */}
                <div style={{ marginTop: 6, textAlign: 'right' }}>
                  <ConfirmButton
                    action={deleteItem.bind(null, invoiceId, it.id)}
                    confirm={`Remove “${it.description}” from this invoice?${it.lesson_id ? ' The lesson can be added to an invoice again later.' : ''}`}
                    className="btn btn-ghost btn-sm"
                  >
                    Remove
                  </ConfirmButton>
                </div>
              </li>
              ),
            )}
            <li className="spread" style={{ fontWeight: 900, fontSize: '1.15rem' }}>
              <span>Total</span>
              <span>{money(props.total, c)}</span>
            </li>
          </ul>
        )}
      </Card>

      {props.editable && (
        <div className="grid grid-2">
          {/* ---- Add an item (equipment / other) ---- */}
          <Card title="Add an item">
            <ActionForm action={addItem.bind(null, invoiceId)} resetOnSuccess>
              <Segmented
                label="Type"
                name="kind"
                options={KIND_OPTIONS}
                defaultValue="equipment"
                hint="Equipment covers strings, books, reeds, rosin and the like."
              />
              <TextField label="Description" name="description" id="new-description" placeholder="e.g. Set of violin strings (Dominant 4/4)" required />
              <div className="form-grid">
                <TextField label="Quantity" name="quantity" id="new-quantity" defaultValue="1" inputMode="decimal" />
                <MoneyField label="Price each" name="unit_price" id="new-unit_price" symbol={symbol} placeholder="0.00" required />
              </div>
              <SubmitButton pendingText="Adding…">Add item</SubmitButton>
            </ActionForm>
          </Card>

          {/* ---- Add from the equipment you sell (stock updates automatically) ---- */}
          {props.products && props.products.length > 0 && (
            <Card title="Add equipment you sell">
              <ActionForm action={addProductToInvoice.bind(null, invoiceId)} resetOnSuccess>
                <Picker name="product_id" label="Item" options={props.products} />
                <TextField label="How many" name="quantity" id="product-quantity" defaultValue="1" inputMode="numeric" />
                <SubmitButton pendingText="Adding…">Add to invoice</SubmitButton>
              </ActionForm>
            </Card>
          )}

          {/* ---- Pull in any lessons not yet billed ---- */}
          <Card title="Add uninvoiced lessons">
            {props.hasStudent ? (
              <ActionForm action={addUninvoicedLessons.bind(null, invoiceId)}>
                <p className="small muted" style={{ margin: 0 }}>
                  Adds this student’s chargeable lessons in these dates that aren’t on another invoice yet — handy if you booked extra lessons after
                  making the invoice.
                </p>
                <div className="form-grid">
                  <TextField label="From" name="from" id="lessons-from" type="date" defaultValue={props.lessonPeriod[0]} />
                  <TextField label="To" name="to" id="lessons-to" type="date" defaultValue={props.lessonPeriod[1]} />
                </div>
                <SubmitButton className="btn btn-secondary" pendingText="Checking…">
                  Add uninvoiced lessons
                </SubmitButton>
              </ActionForm>
            ) : (
              <p className="muted">This invoice isn’t linked to a student, so there are no lessons to pull in.</p>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
