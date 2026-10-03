// =============================================================================
// equipment/page.tsx — equipment you sell to pupils (strings, reeds, books…)
// The catalogue (price, profit, stock) fills the page; "Record a sale" (adds to
// the pupil's draft invoice) and "+ Add item" open in pop-ups from the header.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { currencySymbol, money } from '@/lib/format'
import { monthBounds, todayISO } from '@/lib/dates'
import { distinctValues, studentOptions } from '@/lib/queries'
import { productOptions, stockState, stockText } from '@/lib/products'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Picker } from '@/components/pickers'
import { Badge, Card, EmptyState, MoneyField, PageHeader, Stat, TextField } from '@/components/ui'
import { ModalButton } from '@/components/modal'
import { ProductForm } from './product-form'
import { createProduct, sellProduct } from './actions'

export const metadata: Metadata = { title: 'Equipment for sale' }

const TABS = [
  { key: 'active', label: 'For sale' },
  { key: 'low', label: 'Low / out of stock' },
  { key: 'hidden', label: 'Hidden' },
] as const

const STOCK_TONES = { ok: 'teal', low: 'butter', out: 'coral', untracked: 'plain' } as const

export default async function EquipmentPage({ searchParams }: PageProps<'/equipment'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? 'active'
  const sym = currencySymbol(teacher.currency)
  const [monthStart, monthEnd] = monthBounds(todayISO(teacher.timezone))

  const [products, monthSales, students, catalogue, categories] = await Promise.all([
    db().from('products').select('*').eq('teacher_id', teacher.id).order('category').order('name').then(must),
    db()
      .from('invoice_items')
      .select('amount, quantity, product_id, invoices!inner(status, issue_date)')
      .eq('teacher_id', teacher.id)
      .not('product_id', 'is', null)
      .neq('invoices.status', 'void')
      .gte('invoices.issue_date', monthStart)
      .lte('invoices.issue_date', monthEnd)
      .then(must),
    studentOptions(teacher.id),
    productOptions(teacher),
    distinctValues(teacher.id, 'products', 'category'),
  ])

  const active = products.filter((p) => p.active)
  const lowOrOut = active.filter((p) => ['low', 'out'].includes(stockState(p)))
  const shown = tab === 'hidden' ? products.filter((p) => !p.active) : tab === 'low' ? lowOrOut : active
  const salesTotal = monthSales.reduce((sum, s) => sum + Number(s.amount), 0)
  const unitsSold = monthSales.reduce((sum, s) => sum + Number(s.quantity), 0)

  return (
    <>
      <PageHeader
        title="Equipment for sale"
        subtitle="Strings, reeds, books and anything else you sell to pupils. Sales go onto the pupil's invoice."
        actions={
          <>
            {/* ---- Record a sale (modal) ---- */}
            <ModalButton label="Record a sale" title="Record a sale" className="btn btn-secondary">
              {catalogue.length === 0 || students.length === 0 ? (
                <p className="muted">{catalogue.length === 0 ? 'Add an item first.' : 'Add a pupil first.'}</p>
              ) : (
                <ActionForm action={sellProduct.bind(null, null)} resetOnSuccess>
                  <Picker name="product_id" label="What did you sell?" options={catalogue} />
                  <Picker name="student_id" label="Who to?" options={students} />
                  <div className="form-grid">
                    <TextField label="How many" name="quantity" id="sale-quantity" defaultValue="1" inputMode="numeric" />
                    <MoneyField label="Price each" name="unit_price" id="sale-price" symbol={sym} placeholder="Usual price" hint="Leave blank for the usual price." />
                  </div>
                  <SubmitButton pendingText="Adding…">Add to their invoice</SubmitButton>
                  <p className="small muted" style={{ margin: 0 }}>
                    Goes onto the pupil&apos;s draft invoice — or a new one if they don&apos;t have a draft.
                  </p>
                </ActionForm>
              )}
            </ModalButton>

            {/* ---- Add an item (modal) ---- */}
            <ModalButton label="+ Add item" title="Add an item">
              <ProductForm action={createProduct} categories={categories} symbol={sym} />
            </ModalButton>
          </>
        }
      />

      {/* ---- Summary tiles ---- */}
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <Stat label="Sold this month" value={money(salesTotal, teacher.currency)} note={`${unitsSold} item${unitsSold === 1 ? '' : 's'}`} tone="teal" />
        <Stat label="Items for sale" value={active.length} />
        <Stat label="Low or out of stock" value={lowOrOut.length} tone={lowOrOut.length ? 'coral' : undefined} href={lowOrOut.length ? '/equipment?tab=low' : undefined} />
      </div>

      {/* ---- Catalogue ---- */}
      <Card>
        <nav className="tabs" aria-label="Filter items">
          {TABS.map((t) => (
            <Link key={t.key} href={`/equipment?tab=${t.key}`} aria-current={t.key === tab ? 'page' : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        {shown.length === 0 ? (
          <EmptyState title={tab === 'active' ? 'Nothing for sale yet' : 'Nothing here'}>
            {tab === 'active' ? 'Add the things you sell — strings, reeds, books — with the “+ Add item” button.' : null}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="center">Type</th>
                  <th className="center">Price</th>
                  <th className="center">Profit</th>
                  <th className="center">Stock</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const state = stockState(p)
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link className="rowlink" href={`/equipment/${p.id}`}>
                          {p.name}
                        </Link>
                      </td>
                      <td className="center">{p.category || <span className="muted">—</span>}</td>
                      <td className="center nowrap">{money(p.price, teacher.currency)}</td>
                      <td className="center nowrap">{p.cost !== null ? money(Number(p.price) - Number(p.cost), teacher.currency) : <span className="muted">—</span>}</td>
                      <td className="center">{state === 'untracked' ? <span className="muted small">Not counted</span> : <Badge tone={STOCK_TONES[state]}>{stockText(p)}</Badge>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
