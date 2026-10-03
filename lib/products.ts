// =============================================================================
// lib/products.ts — equipment for sale: picker options, stock wording, and
// "sell to a pupil" (adds the item to the pupil's draft invoice).
//
// Stock itself is adjusted by database triggers (0002_products.sql) whenever
// a linked invoice line is added, changed, removed or its invoice is voided —
// so nothing here ever writes products.stock for a sale.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { money } from './format'
import { addDaysISO, todayISO } from './dates'
import { billToFor, nextPosition } from './invoices'
import { FormError } from './forms'
import type { Product, Teacher } from './database.types'
import type { PickerOption } from '@/components/pickers'

// ---- Stock wording ------------------------------------------------------------------
export type StockState = 'untracked' | 'ok' | 'low' | 'out'

export function stockState(p: Pick<Product, 'track_stock' | 'stock' | 'low_stock_at'>): StockState {
  if (!p.track_stock) return 'untracked'
  if (p.stock <= 0) return 'out'
  if (p.low_stock_at !== null && p.stock <= p.low_stock_at) return 'low'
  return 'ok'
}

export function stockText(p: Pick<Product, 'track_stock' | 'stock' | 'low_stock_at'>): string {
  if (!p.track_stock) return 'Stock not tracked'
  if (p.stock < 0) return `${Math.abs(p.stock)} oversold`
  return p.stock === 0 ? 'Out of stock' : `${p.stock} in stock`
}

// ---- Picker options -------------------------------------------------------------------
export async function productOptions(teacher: Teacher): Promise<PickerOption[]> {
  const rows = must(
    await db().from('products').select('id, name, category, price, track_stock, stock, low_stock_at').eq('teacher_id', teacher.id).eq('active', true).order('name'),
  )
  return rows.map((p) => ({
    id: p.id,
    label: p.name,
    sub: [money(p.price, teacher.currency), p.category, p.track_stock ? stockText(p) : ''].filter(Boolean).join(' · '),
  }))
}

// ---- Load one product (scoped) ---------------------------------------------------------
export async function ownProduct(teacherId: string, id: string): Promise<Product> {
  const { data } = await db().from('products').select('*').eq('id', id).eq('teacher_id', teacherId).maybeSingle()
  if (!data) throw new FormError('That item no longer exists — refresh and try again.')
  return data
}

// ---- The pupil's open draft invoice (or a new one) ---------------------------------------
/** Most recent draft invoice for this pupil; creates one if there isn't one. */
export async function draftInvoiceFor(teacher: Teacher, studentId: string): Promise<{ id: string; number: string; created: boolean }> {
  const { data: existing } = await db()
    .from('invoices')
    .select('id, number')
    .eq('teacher_id', teacher.id)
    .eq('student_id', studentId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) return { ...existing, created: false }

  const billTo = await billToFor(teacher.id, studentId)
  if (!billTo) throw new FormError('That pupil no longer exists — refresh and try again.')
  const { data: number, error } = await db().rpc('next_invoice_number', { p_teacher: teacher.id })
  if (error || !number) throw new Error(error?.message ?? 'Could not allocate an invoice number.')

  const issue = todayISO(teacher.timezone)
  const inv = must(
    await db()
      .from('invoices')
      .insert({
        teacher_id: teacher.id,
        student_id: studentId,
        number,
        bill_to_name: billTo.name,
        bill_to_email: billTo.email,
        bill_to_address: billTo.address,
        issue_date: issue,
        due_date: addDaysISO(issue, teacher.invoice_terms_days),
        status: 'draft',
      })
      .select('id, number')
      .single(),
  )
  return { ...inv, created: true }
}

// ---- Add a product line to an invoice ----------------------------------------------------
export async function addProductLine(teacher: Teacher, invoiceId: string, product: Product, quantity: number, unitPrice?: number | null) {
  if (quantity <= 0) throw new FormError('Quantity must be more than 0.')
  must(
    await db()
      .from('invoice_items')
      .insert({
        teacher_id: teacher.id,
        invoice_id: invoiceId,
        kind: 'equipment',
        description: product.name,
        quantity,
        unit_price: unitPrice ?? product.price,
        product_id: product.id,
        position: await nextPosition(teacher.id, invoiceId),
      })
      .select('id'),
  )
}
