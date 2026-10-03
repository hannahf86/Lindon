// =============================================================================
// equipment/[id]/page.tsx — one item you sell: edit it, sell it to a pupil,
// adjust stock (deliveries, breakages) and see who's bought it.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, must, requireTeacher } from '@/lib/db'
import { currencySymbol, money } from '@/lib/format'
import { fmtDate } from '@/lib/dates'
import { distinctValues, studentOptions } from '@/lib/queries'
import { stockState, stockText } from '@/lib/products'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Picker } from '@/components/pickers'
import { Badge, Card, MoneyField, PageHeader, Segmented, StatusBadge, TextField } from '@/components/ui'
import { ProductForm } from '../product-form'
import { adjustStock, deleteProduct, sellProduct, updateProduct } from '../actions'

export const metadata: Metadata = { title: 'Equipment item' }

const STOCK_TONES = { ok: 'teal', low: 'butter', out: 'coral', untracked: 'plain' } as const

export default async function EquipmentItemPage({ params }: PageProps<'/equipment/[id]'>) {
  const { id } = await params
  const teacher = await requireTeacher()
  const { data: p } = await db().from('products').select('*').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
  if (!p) notFound()

  const [sales, students, categories] = await Promise.all([
    db()
      .from('invoice_items')
      .select('id, quantity, unit_price, amount, invoices!inner(id, number, status, issue_date, bill_to_name, students(first_name, last_name))')
      .eq('teacher_id', teacher.id)
      .eq('product_id', id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(must),
    studentOptions(teacher.id),
    distinctValues(teacher.id, 'products', 'category'),
  ])

  const sym = currencySymbol(teacher.currency)
  const state = stockState(p)
  const live = sales.filter((s) => s.invoices.status !== 'void')
  const soldUnits = live.reduce((n, s) => n + Number(s.quantity), 0)
  const soldValue = live.reduce((n, s) => n + Number(s.amount), 0)

  return (
    <>
      <PageHeader
        title={p.name}
        back={{ href: '/equipment', label: 'Equipment for sale' }}
        subtitle={
          <span className="row" style={{ gap: 6 }}>
            <strong>{money(p.price, teacher.currency)}</strong>
            {p.category && <span>· {p.category}</span>}
            {state !== 'untracked' && <Badge tone={STOCK_TONES[state]}>{stockText(p)}</Badge>}
            {!p.active && <Badge>Hidden</Badge>}
          </span>
        }
      />

      <div className="split">
        <div className="stack">
          {/* ---- Sell to a pupil ---- */}
          {p.active && (
            <Card title="Sell to a pupil">
              <ActionForm action={sellProduct.bind(null, id)} resetOnSuccess>
                <Picker name="student_id" label="Who to?" options={students} />
                <div className="form-grid">
                  <TextField label="How many" name="quantity" defaultValue="1" inputMode="numeric" />
                  <MoneyField label="Price each" name="unit_price" symbol={sym} placeholder={Number(p.price).toFixed(2)} hint="Leave blank for the usual price." />
                </div>
                <SubmitButton pendingText="Adding…">Add to their invoice</SubmitButton>
              </ActionForm>
            </Card>
          )}

          {/* ---- Sales history ---- */}
          <Card title="Sales" actions={<span className="muted small">{soldUnits} sold · {money(soldValue, teacher.currency)}</span>}>
            {sales.length === 0 ? (
              <p className="muted">Not sold yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Pupil</th>
                      <th>Invoice</th>
                      <th className="right">Qty</th>
                      <th className="right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((s) => (
                      <tr key={s.id}>
                        <td className="nowrap">{fmtDate(s.invoices.issue_date, 'd MMM yyyy')}</td>
                        <td>{s.invoices.students ? `${s.invoices.students.first_name} ${s.invoices.students.last_name}`.trim() : s.invoices.bill_to_name}</td>
                        <td className="nowrap">
                          <Link href={`/invoices/${s.invoices.id}`}>{s.invoices.number}</Link> <StatusBadge status={s.invoices.status} />
                        </td>
                        <td className="right">{Number(s.quantity)}</td>
                        <td className="right nowrap">{money(s.amount, teacher.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          {/* ---- Stock in / out ---- */}
          {p.track_stock && (
            <Card title="Stock">
              <p style={{ fontSize: '1.6rem', fontWeight: 900, margin: '0 0 10px' }}>{stockText(p)}</p>
              <ActionForm action={adjustStock.bind(null, id)} resetOnSuccess>
                <Segmented
                  label="Change"
                  name="mode"
                  options={[
                    { value: 'add', label: 'Delivery in' },
                    { value: 'remove', label: 'Take out' },
                    { value: 'set', label: 'Set count' },
                  ]}
                  defaultValue="add"
                  hint="Take out for breakages or freebies. Set count after a stock-take."
                />
                <TextField label="Amount" name="amount" inputMode="numeric" required />
                <SubmitButton className="btn btn-secondary">Update stock</SubmitButton>
              </ActionForm>
            </Card>
          )}

          {/* ---- Edit ---- */}
          <Card title="Details">
            <ProductForm action={updateProduct.bind(null, id)} product={p} categories={categories} symbol={sym} />
          </Card>

          {/* ---- Delete ---- */}
          <Card>
            <ConfirmButton
              action={deleteProduct.bind(null, id)}
              confirm={`Delete ${p.name}? Past invoices keep the line and price. To stop selling it but keep its history here, use "Hide from sale" instead.`}
            >
              Delete item
            </ConfirmButton>
          </Card>
        </div>
      </div>
    </>
  )
}
