// =============================================================================
// equipment/page.tsx — Invoice items (feature: equipment)
//
// A simple list of things the teacher charges for besides lessons — strings,
// books, accessories — each with a name and the price they set. Items are
// added to invoices from the invoice page ("Add from your items"). Each row can
// be edited in place or deleted; "+ Add item" opens a pop-up.
// =============================================================================
import type { Metadata } from 'next'
import { db, must } from '@/lib/db'
import { currencySymbol } from '@/lib/format'
import { requireFeature } from '@/lib/require-feature'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Card, EmptyState, MoneyField, PageHeader, TextField } from '@/components/ui'
import { ModalButton } from '@/components/modal'
import { createProduct, deleteProduct, updateProduct } from './actions'

export const metadata: Metadata = { title: 'Invoice items' }

export default async function InvoiceItemsPage() {
  const teacher = await requireFeature('equipment')
  const sym = currencySymbol(teacher.currency)
  const items = must(await db().from('products').select('id, name, price').eq('teacher_id', teacher.id).eq('active', true).order('name'))

  return (
    <>
      <PageHeader
        title="Invoice items"
        subtitle="Things you charge for besides lessons — strings, books, accessories. Set the price here, then add them to any invoice."
        actions={
          <ModalButton label="+ Add item" title="Add an item">
            <ActionForm action={createProduct} resetOnSuccess>
              <TextField label="Name" name="name" required placeholder="e.g. Set of violin strings" />
              <MoneyField label="Price" name="price" symbol={sym} placeholder="0.00" required />
              <SubmitButton>Add item</SubmitButton>
            </ActionForm>
          </ModalButton>
        }
      />

      {/* ---- The list: edit in place ---- */}
      <Card>
        {items.length === 0 ? (
          <EmptyState title="No items yet">Add the things you charge for with the “+ Add item” button.</EmptyState>
        ) : (
          <ul className="list">
            {items.map((it) => (
              <li key={it.id} className="spread" style={{ alignItems: 'flex-end' }}>
                <ActionForm action={updateProduct.bind(null, it.id)} className="row">
                  <div style={{ minWidth: 220, flex: '1 1 260px' }}>
                    <TextField label="Name" name="name" id={`name-${it.id}`} defaultValue={it.name} required />
                  </div>
                  <div style={{ width: 140 }}>
                    <MoneyField label="Price" name="price" id={`price-${it.id}`} symbol={sym} defaultValue={Number(it.price).toFixed(2)} required />
                  </div>
                  <SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton>
                </ActionForm>
                <ConfirmButton
                  action={deleteProduct.bind(null, it.id)}
                  confirm={`Delete ${it.name}? Invoices it's already on keep the line and price.`}
                  className="btn btn-ghost btn-sm"
                >
                  Delete
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
