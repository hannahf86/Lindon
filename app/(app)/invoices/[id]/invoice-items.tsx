// =============================================================================
// invoices/[id]/invoice-items.tsx — the invoice's lines (simplified, Hannah's
// call)
//
// · Lessons are just listed (date, description, amount) — never edited here;
//   lessons are managed through the schedule.
// · Other lines (items, exam fees, hire) can be changed or removed behind a
//   small "Edit" accordion while the invoice is editable. Make-up credits can
//   be taken off.
// · "+ Add an item" is an accordion, closed until needed; inside it, the
//   teacher's saved items (Invoice items feature) and a one-off item form.
// · Exam fees / hire waiting for this pupil appear underneath when there are any.
// Paid and void invoices show the same list with no editing.
// =============================================================================
import type { InvoiceItem } from '@/lib/database.types'
import type { PendingDeposit, PendingExamFee, PendingHire } from '@/lib/addons'
import { money } from '@/lib/format'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Badge, Card, MoneyField, Segmented, TextField } from '@/components/ui'
import { addDepositToInvoice, addExamFeeToInvoice, addHireToInvoice, addItem, deleteItem, updateItem } from '../actions'
import { addProductToInvoice } from '@/app/(app)/equipment/actions'
import { Picker, type PickerOption } from '@/components/pickers'

const KIND_LABEL: Record<string, string> = { lesson: 'Lesson', equipment: 'Item', exam: 'Exam', hire: 'Hire', other: 'Other', credit: 'Make-up credit' }
const KIND_TONES = { lesson: 'sky', equipment: 'butter', exam: 'sky', hire: 'butter', other: 'purple', credit: 'teal' } as const
/** What a new one-off line can be (lessons come from the schedule). */
const ADD_KINDS = [
  { value: 'equipment', label: 'Item' },
  { value: 'other', label: 'Other' },
]

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
  /** Saved items the teacher sells (Invoice items feature) */
  products?: PickerOption[]
  /** Exam fees and hire for this pupil that aren't on an invoice yet */
  examFees?: PendingExamFee[]
  hire?: PendingHire[]
  /** Loan deposits not billed or paid yet */
  deposits?: PendingDeposit[]
}) {
  const { invoiceId, items, currency: c } = props
  const symbol = symbolFor(c)

  return (
    <>
      {/* ---- Lines ---- */}
      <Card title="Items">
        {items.length === 0 ? (
          <p className="muted">Nothing on this invoice yet.</p>
        ) : (
          <ul className="inv-lines">
            {items.map((it) => (
              <li key={it.id} className="inv-line">
                <div className="inv-line-main">
                  <span className="inv-line-desc">
                    {it.kind !== 'lesson' && (
                      <>
                        <Badge tone={KIND_TONES[it.kind]}>{KIND_LABEL[it.kind]}</Badge>{' '}
                      </>
                    )}
                    {it.description}
                    {Number(it.quantity) !== 1 && (
                      <span className="small muted">
                        {' '}
                        · {Number(it.quantity)} × {money(it.unit_price, c)}
                      </span>
                    )}
                  </span>
                  <strong className="nowrap">{money(it.amount, c)}</strong>
                </div>

                {/* ---- Editing: never for lessons; credits can only be taken off ---- */}
                {props.editable && it.kind === 'credit' && (
                  <div className="inv-line-tools">
                    <ConfirmButton
                      action={deleteItem.bind(null, invoiceId, it.id)}
                      confirm="Take this credit off the invoice? It goes back to the pupil's credit balance for a later invoice."
                      className="link-btn"
                    >
                      Remove
                    </ConfirmButton>
                  </div>
                )}
                {props.editable && it.kind !== 'lesson' && it.kind !== 'credit' && (
                  <details className="inv-line-edit">
                    <summary className="link-btn">Edit</summary>
                    <ActionForm action={updateItem.bind(null, invoiceId, it.id)}>
                      {/* The type stays as it is */}
                      <input type="hidden" name="kind" value={it.kind} />
                      <TextField label="Description" name="description" id={`desc-${it.id}`} defaultValue={it.description} required />
                      <div className="row" style={{ alignItems: 'flex-end' }}>
                        <div style={{ width: 90 }}>
                          <TextField label="Qty" name="quantity" id={`qty-${it.id}`} defaultValue={String(Number(it.quantity))} inputMode="decimal" />
                        </div>
                        <div style={{ width: 140 }}>
                          <MoneyField label="Price each" name="unit_price" id={`price-${it.id}`} symbol={symbol} defaultValue={Number(it.unit_price).toFixed(2)} />
                        </div>
                        <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
                      </div>
                    </ActionForm>
                    {/* Kept outside the edit form — forms can't be nested */}
                    <ConfirmButton action={deleteItem.bind(null, invoiceId, it.id)} confirm={`Remove “${it.description}” from this invoice?`} className="link-btn">
                      Remove from invoice
                    </ConfirmButton>
                  </details>
                )}
              </li>
            ))}
            <li className="inv-line inv-total">
              <div className="inv-line-main">
                <span>Total</span>
                <span>{money(props.total, c)}</span>
              </div>
            </li>
          </ul>
        )}

        {/* ---- + Add an item (accordion) ---- */}
        {props.editable && (
          <details className="accordion">
            <summary>+ Add an item</summary>
            <div className="accordion-body">
              {props.products && props.products.length > 0 && (
                <ActionForm action={addProductToInvoice.bind(null, invoiceId)} resetOnSuccess>
                  <Picker name="product_id" label="From your saved items" options={props.products} />
                  <div className="row" style={{ alignItems: 'flex-end' }}>
                    <div style={{ width: 120 }}>
                      <TextField label="How many" name="quantity" id="product-quantity" defaultValue="1" inputMode="numeric" />
                    </div>
                    <SubmitButton className="btn btn-secondary" pendingText="Adding…">
                      Add to invoice
                    </SubmitButton>
                  </div>
                </ActionForm>
              )}
              <ActionForm action={addItem.bind(null, invoiceId)} resetOnSuccess>
                {props.products && props.products.length > 0 && <h4 style={{ margin: '8px 0 0' }}>…or something else</h4>}
                <Segmented label="Type" name="kind" options={ADD_KINDS} defaultValue="equipment" hint="Item covers strings, books, reeds, rosin and the like." />
                <TextField label="Description" name="description" id="new-description" placeholder="e.g. Set of violin strings" required />
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <div style={{ width: 120 }}>
                    <TextField label="Quantity" name="quantity" id="new-quantity" defaultValue="1" inputMode="decimal" />
                  </div>
                  <div style={{ width: 150 }}>
                    <MoneyField label="Price each" name="unit_price" id="new-unit_price" symbol={symbol} placeholder="0.00" required />
                  </div>
                  <SubmitButton pendingText="Adding…">Add item</SubmitButton>
                </div>
              </ActionForm>
            </div>
          </details>
        )}
      </Card>

      {/* ---- Add-ons waiting for this pupil: exam fees and instrument hire ---- */}
      {props.editable && !!(props.examFees?.length || props.hire?.length || props.deposits?.length) && (
        <Card title="Waiting to be billed">
          <ul className="list">
            {props.examFees?.map((f) => (
              <li key={f.examId} className="spread">
                <span>
                  <Badge tone="sky">Exam</Badge> {f.description} · <strong>{money(f.amount, c)}</strong>
                </span>
                <ActionForm action={addExamFeeToInvoice.bind(null, invoiceId, f.examId)} className="row">
                  <SubmitButton className="btn btn-secondary btn-sm" pendingText="Adding…">
                    Add
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
            {props.hire?.map((h) => (
              <li key={h.loanId} className="spread">
                <span>
                  <Badge tone="butter">Hire</Badge> {h.description} · <strong>{money(h.amount, c)}</strong>
                </span>
                <ActionForm action={addHireToInvoice.bind(null, invoiceId, h.loanId, h.month)} className="row">
                  <SubmitButton className="btn btn-secondary btn-sm" pendingText="Adding…">
                    Add
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
            {props.deposits?.map((d) => (
              <li key={d.loanId} className="spread">
                <span>
                  <Badge tone="purple">Deposit</Badge> {d.description} · <strong>{money(d.amount, c)}</strong>
                </span>
                <ActionForm action={addDepositToInvoice.bind(null, invoiceId, d.loanId)} className="row">
                  <SubmitButton className="btn btn-secondary btn-sm" pendingText="Adding…">
                    Add
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
