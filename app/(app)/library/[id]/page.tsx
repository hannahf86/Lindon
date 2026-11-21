// =============================================================================
// library/[id]/page.tsx — one library item: where it is now, lend / return,
// full loan history, edit details, archive or delete.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, must } from '@/lib/db'
import { fullName, money } from '@/lib/format'
import { fmtDate, todayISO } from '@/lib/dates'
import { distinctValues, studentOptions } from '@/lib/queries'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Badge, Card, MoneyField, PageHeader } from '@/components/ui'
import { deleteItem, returnLoan, updateHireFee, updateItem } from '../actions'
import { ItemForm } from '../item-form'
import { LendForm } from '../lend-form'
import { currencySymbol, loanState } from '../helpers'
import { requireFeature } from '@/lib/require-feature'

export const metadata: Metadata = { title: 'Library item' }

export default async function LibraryItemPage({ params, searchParams }: PageProps<'/library/[id]'>) {
  const { id } = await params
  const sp = await searchParams
  const teacher = await requireFeature('library')
  const today = todayISO(teacher.timezone)

  const { data: item } = await db().from('library_items').select('*').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
  if (!item) notFound()

  const [loans, students, kinds, conditions] = await Promise.all([
    db()
      .from('loans')
      .select('*, students(id, first_name, last_name)')
      .eq('teacher_id', teacher.id)
      .eq('item_id', id)
      .order('lent_on', { ascending: false })
      .then(must),
    studentOptions(teacher.id),
    distinctValues(teacher.id, 'library_items', 'kind'),
    distinctValues(teacher.id, 'library_items', 'condition'),
  ])
  const open = loans.find((l) => !l.returned_on)
  const state = loanState(open, today)

  return (
    <>
      <PageHeader
        title={item.title}
        back={{ href: '/library', label: 'Library & loans' }}
        subtitle={
          <span className="row" style={{ gap: 6 }}>
            {state === 'available' ? <Badge tone="teal">Available</Badge> : state === 'overdue' ? <Badge tone="coral">Overdue</Badge> : <Badge tone="sky">On loan</Badge>}
            {item.archived && <Badge>Archived</Badge>}
            {item.kind && <span>{item.kind}</span>}
            {item.identifier && <span>· {item.identifier}</span>}
            {item.value !== null && <span>· worth {money(item.value, teacher.currency)}</span>}
          </span>
        }
      />

      {sp.new === '1' && (
        <div className="alert alert-ok" style={{ marginBottom: 20 }}>
          Item added. You can lend it to a student below.
        </div>
      )}

      <div className="split">
        <div className="stack">
          {/* ---- Where is it now? ---- */}
          <Card title="Right now">
            {open ? (
              <>
              <div className="spread">
                <div>
                  <div>
                    {open.hire_fee ? 'On hire to' : 'On loan to'}{' '}
                    {open.students ? (
                      <Link href={`/students/${open.students.id}`} style={{ fontWeight: 800 }}>
                        {fullName(open.students)}
                      </Link>
                    ) : (
                      'a student'
                    )}
                  </div>
                  <div className="small muted">
                    Since {fmtDate(open.lent_on)}
                    {open.due_on && ` · due back ${fmtDate(open.due_on)}`}
                  </div>
                  {state === 'overdue' && (
                    <div className="small" style={{ color: 'var(--coral-ink)', fontWeight: 700 }}>
                      Overdue — it was due back {fmtDate(open.due_on)}.
                    </div>
                  )}
                  {open.notes && <div className="small">{open.notes}</div>}
                </div>
                <ConfirmButton action={returnLoan.bind(null, open.id)} confirm={`Mark “${item.title}” as returned today?`} className="btn btn-sm">
                  Mark returned
                </ConfirmButton>
              </div>
              {/* ---- Free loan or paid hire ---- */}
              <div className="form-section">
                <ActionForm action={updateHireFee.bind(null, open.id)}>
                  <MoneyField
                    label="Monthly hire fee"
                    name="hire_fee"
                    symbol={currencySymbol(teacher.currency)}
                    defaultValue={open.hire_fee ? Number(open.hire_fee).toFixed(2) : ''}
                    placeholder="0.00"
                    hint="Leave empty for a free loan. Added to their monthly invoice until it’s returned."
                  />
                  <SubmitButton className="btn btn-secondary btn-sm">Save fee</SubmitButton>
                </ActionForm>
              </div>
              </>
            ) : item.archived ? (
              <p className="muted">This item is archived. Untick “Archived” below to lend it again.</p>
            ) : students.length === 0 ? (
              <p className="muted">
                Available. Add a <Link href="/students/new">student</Link> to lend it to.
              </p>
            ) : (
              <>
                <p className="muted">Available — lend it to a student:</p>
                <LendForm itemId={item.id} students={students} today={today} currencySymbol={currencySymbol(teacher.currency)} />
              </>
            )}
          </Card>

          {/* ---- Loan history ---- */}
          <Card title="Loan history">
            {loans.length === 0 ? (
              <p className="muted">Never lent out yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Borrower</th>
                      <th>Lent</th>
                      <th>Due</th>
                      <th>Returned</th>
                      <th className="right">Hire</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((l) => (
                      <tr key={l.id}>
                        <td>
                          {l.students ? (
                            <Link className="rowlink" href={`/students/${l.students.id}`}>
                              {fullName(l.students)}
                            </Link>
                          ) : (
                            <span className="muted">Deleted student</span>
                          )}
                          {l.notes && <div className="small muted">{l.notes}</div>}
                        </td>
                        <td className="nowrap">{fmtDate(l.lent_on, 'd MMM yyyy')}</td>
                        <td className="nowrap">{l.due_on ? fmtDate(l.due_on, 'd MMM yyyy') : <span className="muted">—</span>}</td>
                        <td className="nowrap">
                          {l.returned_on ? (
                            fmtDate(l.returned_on, 'd MMM yyyy')
                          ) : l.due_on && l.due_on < today ? (
                            <Badge tone="coral">Overdue</Badge>
                          ) : (
                            <Badge tone="sky">Still out</Badge>
                          )}
                        </td>
                        <td className="right nowrap">{l.hire_fee ? `${money(l.hire_fee, teacher.currency)}/month` : <span className="muted">Free</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="stack">
          {/* ---- Edit details ---- */}
          <ItemForm
            action={updateItem.bind(null, id)}
            item={item}
            kinds={kinds}
            conditions={conditions}
            currencySymbol={currencySymbol(teacher.currency)}
            cancelHref="/library"
          />

          {/* ---- Danger zone ---- */}
          <Card>
            <ConfirmButton
              action={deleteItem.bind(null, id)}
              confirm={`Delete “${item.title}” and its whole loan history? This can't be undone — consider archiving it instead.`}
            >
              Delete item
            </ConfirmButton>
          </Card>
        </div>
      </div>
    </>
  )
}
