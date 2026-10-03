'use server'
// =============================================================================
// equipment/actions.ts — equipment for sale: create / update / delete items,
// adjust stock (deliveries, breakages), and sell to a pupil (adds a line to
// their draft invoice). Every query is scoped to the signed-in teacher.
// Stock for sales is moved by database triggers, not here.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { bool, handle, int, num, optionalNum, ref, required, str, FormError, type ActionState } from '@/lib/forms'
import { addProductLine, draftInvoiceFor, ownProduct } from '@/lib/products'
import { isEditable } from '@/lib/invoices'

/** Read the item form into a row (shared by create + update). */
function readProduct(fd: FormData) {
  const track = bool(fd, 'track_stock')
  const low = str(fd, 'low_stock_at')
  return {
    name: required(fd, 'name', 'Name'),
    category: str(fd, 'category'),
    sku: str(fd, 'sku'),
    price: num(fd, 'price', 'Price', { min: 0 }),
    cost: optionalNum(fd, 'cost', 'Cost price'),
    track_stock: track,
    low_stock_at: track && low ? int(fd, 'low_stock_at', 'Low stock warning', { min: 0 }) : null,
    notes: str(fd, 'notes'),
  }
}

function revalidateEquipment(id?: string) {
  revalidatePath('/equipment')
  if (id) revalidatePath(`/equipment/${id}`)
  revalidatePath('/invoices', 'layout')
  revalidatePath('/reports')
  revalidatePath('/')
}

// ---- Create --------------------------------------------------------------------------
export async function createProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const row = readProduct(fd)
    const stock = row.track_stock ? int(fd, 'stock', 'Stock', { fallback: 0 }) : 0
    must(await db().from('products').insert({ ...row, stock, teacher_id: teacher.id }).select('id'))
    revalidateEquipment()
    return { ok: `${row.name} added.` }
  })
}

// ---- Update --------------------------------------------------------------------------
export async function updateProduct(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    must(
      await db()
        .from('products')
        .update({ ...readProduct(fd), active: !bool(fd, 'hidden') })
        .eq('id', id)
        .eq('teacher_id', teacher.id)
        .select('id')
        .single(),
    )
    revalidateEquipment(id)
    return { ok: 'Saved.' }
  })
}

// ---- Delete --------------------------------------------------------------------------
// Past invoice lines keep their description and price; they just lose the link.
export async function deleteProduct(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  must(await db().from('products').delete().eq('id', id).eq('teacher_id', teacher.id).select('id'))
  revalidateEquipment()
  redirect('/equipment')
}

// ---- Stock in / out (deliveries, breakages, stock-takes) ---------------------------------
export async function adjustStock(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const product = await ownProduct(teacher.id, id)
    if (!product.track_stock) throw new FormError('Turn on stock tracking for this item first.')
    const mode = str(fd, 'mode')
    const amount = int(fd, 'amount', 'Amount', { min: 0 })
    const stock = mode === 'set' ? amount : mode === 'remove' ? product.stock - amount : product.stock + amount
    must(await db().from('products').update({ stock }).eq('id', id).eq('teacher_id', teacher.id).select('id').single())
    revalidateEquipment(id)
    return { ok: `Stock is now ${stock}.` }
  })
}

// ---- Sell to a pupil ----------------------------------------------------------------------
// Adds the item to the pupil's draft invoice (creating one if needed).
// The price box can be left blank to use the item's normal price.
export async function sellProduct(fixedProductId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const productId = fixedProductId ?? ref(fd, 'product_id')
    const studentId = ref(fd, 'student_id')
    if (!productId) throw new FormError('Choose what you sold.')
    if (!studentId) throw new FormError('Choose who bought it.')
    const product = await ownProduct(teacher.id, productId)
    const quantity = int(fd, 'quantity', 'Quantity', { min: 1, fallback: 1 })
    const price = optionalNum(fd, 'unit_price', 'Price')

    const inv = await draftInvoiceFor(teacher, studentId)
    await addProductLine(teacher, inv.id, product, quantity, price)

    revalidateEquipment(productId)
    revalidatePath(`/students/${studentId}`)
    return {
      ok: inv.created
        ? `Added to a new draft invoice, ${inv.number}. Send it from Invoices when you're ready.`
        : `Added to draft invoice ${inv.number}.`,
    }
  })
}

// ---- Add from the catalogue on an invoice page ------------------------------------------------
export async function addProductToInvoice(invoiceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const { data: inv } = await db().from('invoices').select('id, status, student_id').eq('id', invoiceId).eq('teacher_id', teacher.id).maybeSingle()
    if (!inv) throw new FormError('That invoice no longer exists — refresh and try again.')
    if (!isEditable(inv)) throw new FormError('This invoice is locked. Reopen it as a draft to make changes.')
    const productId = ref(fd, 'product_id')
    if (!productId) throw new FormError('Choose an item.')
    const product = await ownProduct(teacher.id, productId)
    await addProductLine(teacher, invoiceId, product, int(fd, 'quantity', 'Quantity', { min: 1, fallback: 1 }))
    revalidateEquipment(productId)
    revalidatePath(`/invoices/${invoiceId}`)
    return { ok: `${product.name} added.` }
  })
}
