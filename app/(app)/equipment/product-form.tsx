// =============================================================================
// equipment/product-form.tsx — add / edit an item you sell
// Category is typed (past categories offered as one-tap chips).
// =============================================================================
import type { Product } from '@/lib/database.types'
import type { ActionState } from '@/lib/forms'
import { ActionForm, SubmitButton } from '@/components/forms'
import { SuggestField } from '@/components/pickers'
import { MoneyField, TextArea, TextField, Toggle } from '@/components/ui'

export function ProductForm(props: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>
  product?: Product
  categories: string[]
  symbol: string
}) {
  const p = props.product
  return (
    <ActionForm action={props.action} resetOnSuccess={!p}>
      <div className="form-grid">
        <TextField label="Name" name="name" defaultValue={p?.name} required placeholder="e.g. Dominant violin strings 4/4" wrapClass="full" />
        <SuggestField label="Type" name="category" defaultValue={p?.category} suggestions={props.categories} placeholder="e.g. Strings, Reeds, Books" />
        <TextField label="Supplier code" name="sku" defaultValue={p?.sku} placeholder="Optional" />
        <MoneyField label="Selling price" name="price" symbol={props.symbol} defaultValue={p ? Number(p.price).toFixed(2) : ''} placeholder="0.00" required />
        <MoneyField label="What you paid" name="cost" symbol={props.symbol} defaultValue={p?.cost ?? ''} placeholder="Optional" hint="Shows your profit on each sale." />

        {/* ---- Stock ---- */}
        <div className="full form-section">
          <Toggle name="track_stock" label="Keep count of stock" defaultChecked={p?.track_stock ?? false} hint="Sales take items out automatically; voided invoices put them back." />
        </div>
        {!p && <TextField label="How many you have now" name="stock" inputMode="numeric" placeholder="0" />}
        <TextField
          label="Warn me when stock gets down to"
          name="low_stock_at"
          inputMode="numeric"
          defaultValue={p?.low_stock_at ?? ''}
          placeholder="e.g. 2"
        />

        <TextArea label="Notes" name="notes" defaultValue={p?.notes} wrapClass="full" rows={2} style={{ minHeight: 70 }} />
        {p && (
          <div className="full">
            <Toggle name="hidden" label="Hide from sale" defaultChecked={!p.active} hint="For things you've stopped selling. Past sales are kept." />
          </div>
        )}
      </div>
      <div className="form-actions">
        <SubmitButton>{p ? 'Save changes' : 'Add item'}</SubmitButton>
      </div>
    </ActionForm>
  )
}
