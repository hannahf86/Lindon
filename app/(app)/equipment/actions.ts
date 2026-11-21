'use server'
// =============================================================================
// equipment/actions.ts — Invoice items (feature: equipment): add, edit and
// delete items, and add one to an invoice from the invoice page. Every query is
// scoped to the signed-in teacher.
// =============================================================================
import { revalidatePath } from 'next/cache'
import { db, must } from '@/lib/db'
import { handle, int, num, ref, required, FormError, type ActionState } from '@/lib/forms'
import { addProductLine, ownProduct } from '@/lib/products'
import { isEditable } from '@/lib/invoices'
import { requireFeature } from '@/lib/require-feature'

/** Name + price from the item form (shared by add + edit). */
function readItem(fd: FormData) {
  return { name: required(fd, 'name', 'Name'), price: num(fd, 'price', 'Price', { min: 0 }) }
}

function refresh() {
  revalidatePath('/equipment')
  revalidatePath('/invoices', 'layout')
}

// ---- Add -----------------------------------------------------------------------------
export async function createProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireFeature('equipment')
    const row = readItem(fd)
    must(await db().from('products').insert({ ...row, teacher_id: teacher.id }).select('id'))
    refresh()
    return { ok: `${row.name} added.` }
  })
}

// ---- Edit ----------------------------------------------------------------------------
export async function updateProduct(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireFeature('equipment')
    must(await db().from('products').update(readItem(fd)).eq('id', id).eq('teacher_id', teacher.id).select('id').single())
    refresh()
    return { ok: 'Saved.' }
  })
}

// ---- Delete --------------------------------------------------------------------------
// Invoice lines already using it keep their description and price; they just lose the link.
export async function deleteProduct(id: string): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireFeature('equipment')
    must(await db().from('products').delete().eq('id', id).eq('teacher_id', teacher.id).select('id'))
    refresh()
    return { ok: 'Deleted.' }
  })
}

// ---- Add an item to an invoice (invoice page) -----------------------------------------
export async function addProductToInvoice(invoiceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireFeature('equipment')
    const { data: inv } = await db().from('invoices').select('id, status, student_id').eq('id', invoiceId).eq('teacher_id', teacher.id).maybeSingle()
    if (!inv) throw new FormError('That invoice no longer exists — refresh and try again.')
    if (!isEditable(inv)) throw new FormError('This invoice is locked. Reopen it as a draft to make changes.')
    const productId = ref(fd, 'product_id')
    if (!productId) throw new FormError('Choose an item.')
    const product = await ownProduct(teacher.id, productId)
    await addProductLine(teacher, invoiceId, product, int(fd, 'quantity', 'Quantity', { min: 1, fallback: 1 }))
    revalidatePath(`/invoices/${invoiceId}`)
    return { ok: `${product.name} added.` }
  })
}
