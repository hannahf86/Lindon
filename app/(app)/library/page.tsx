// =============================================================================
// library/page.tsx — books & equipment the teacher lends out
// Tabs: All · Available · On loan · Overdue · Archived. Each item shows who
// has it (since / due / overdue) or "Available". The side panel lends an item;
// ?lend_to=<studentId> (from a student's page) preselects the borrower.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName } from '@/lib/format'
import { fmtDate, todayISO } from '@/lib/dates'
import { studentOptions } from '@/lib/queries'
import { ConfirmButton } from '@/components/forms'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { returnLoan } from './actions'
import { LendForm } from './lend-form'
import { loanState } from './helpers'

export const metadata: Metadata = { title: 'Library & loans' }

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'on_loan', label: 'On loan' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'archived', label: 'Archived' },
] as const
type TabKey = (typeof TABS)[number]['key']

export default async function LibraryPage({ searchParams }: PageProps<'/library'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const tab: TabKey = TABS.find((t) => t.key === sp.tab)?.key ?? 'all'
  const lendTo = typeof sp.lend_to === 'string' ? sp.lend_to : undefined
  const today = todayISO(teacher.timezone)

  const [items, openLoans, students] = await Promise.all([
    db().from('library_items').select('*').eq('teacher_id', teacher.id).order('title').then(must),
    db()
      .from('loans')
      .select('id, item_id, lent_on, due_on, students(id, first_name, last_name)')
      .eq('teacher_id', teacher.id)
      .is('returned_on', null)
      .then(must),
    studentOptions(teacher.id),
  ])

  // ---- Work out each item's state, then filter by tab ----
  const loanByItem = new Map(openLoans.map((l) => [l.item_id, l]))
  const rows = items.map((it) => {
    const loan = loanByItem.get(it.id)
    return { item: it, loan, state: loanState(loan, today) }
  })
  const counts: Record<TabKey, number> = {
    all: rows.filter((r) => !r.item.archived).length,
    available: rows.filter((r) => !r.item.archived && r.state === 'available').length,
    on_loan: rows.filter((r) => r.state !== 'available').length,
    overdue: rows.filter((r) => r.state === 'overdue').length,
    archived: rows.filter((r) => r.item.archived).length,
  }
  const visible = rows.filter((r) => {
    if (tab === 'archived') return r.item.archived
    if (tab === 'on_loan') return r.state !== 'available'
    if (tab === 'overdue') return r.state === 'overdue'
    if (r.item.archived) return false
    return tab === 'all' || r.state === 'available'
  })

  const availableOptions = rows
    .filter((r) => !r.item.archived && r.state === 'available')
    .map((r) => ({ id: r.item.id, label: r.item.title, sub: [r.item.kind, r.item.identifier].filter(Boolean).join(' · ') || undefined }))
  const preselect = lendTo && students.some((s) => s.id === lendTo) ? lendTo : undefined
  const tabHref = (t: TabKey) => `/library?tab=${t}${lendTo ? `&lend_to=${lendTo}` : ''}`

  return (
    <>
      <PageHeader
        title="Library & loans"
        subtitle="Books, instruments and equipment you lend to students."
        actions={
          <Link href="/library/new" className="btn">
            + Add item
          </Link>
        }
      />

      {/* ---- Tabs ---- */}
      <nav className="tabs" aria-label="Filter items">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} aria-current={t.key === tab ? 'page' : undefined}>
            {t.label} ({counts[t.key]})
          </Link>
        ))}
      </nav>

      <div className="split">
        {/* ---- Items table ---- */}
        <Card>
          {visible.length === 0 ? (
            <EmptyState
              title={items.length === 0 ? 'Your library is empty' : 'Nothing here'}
              action={
                items.length === 0 && (
                  <Link href="/library/new" className="btn">
                    Add your first item
                  </Link>
                )
              }
            >
              {items.length === 0
                ? 'Add the books and instruments you lend out, then keep track of who has what.'
                : tab === 'overdue'
                  ? 'Nothing is overdue — everything is back on time.'
                  : 'No items match this filter.'}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Where is it?</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(({ item, loan, state }) => (
                    <tr key={item.id}>
                      <td>
                        <Link className="rowlink" href={`/library/${item.id}`}>
                          {item.title}
                        </Link>
                        <div className="small muted">{[item.kind, item.identifier, item.condition].filter(Boolean).join(' · ')}</div>
                        {item.archived && <Badge>Archived</Badge>}
                      </td>
                      <td className="small">
                        {loan ? (
                          <>
                            <div>
                              On loan to{' '}
                              {loan.students ? (
                                <Link href={`/students/${loan.students.id}`} style={{ fontWeight: 800 }}>
                                  {fullName(loan.students)}
                                </Link>
                              ) : (
                                'a student'
                              )}{' '}
                              {state === 'overdue' && <Badge tone="coral">Overdue</Badge>}
                            </div>
                            <div className="muted">
                              Since {fmtDate(loan.lent_on, 'd MMM yyyy')}
                              {loan.due_on && ` · due ${fmtDate(loan.due_on, 'd MMM yyyy')}`}
                            </div>
                          </>
                        ) : (
                          <Badge tone="teal">Available</Badge>
                        )}
                      </td>
                      <td className="right">
                        {loan && (
                          <ConfirmButton
                            action={returnLoan.bind(null, loan.id)}
                            confirm={`Mark “${item.title}” as returned today?`}
                            className="btn btn-secondary btn-sm"
                          >
                            Returned
                          </ConfirmButton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ---- Lend an item ---- */}
        <Card title="Lend an item" id="lend">
          {availableOptions.length === 0 ? (
            <p className="muted">
              {items.length === 0 ? 'Add an item first, then you can lend it here.' : 'Everything is out on loan or archived right now.'}
            </p>
          ) : students.length === 0 ? (
            <p className="muted">
              Add a <Link href="/students/new">student</Link> first, then you can lend them things.
            </p>
          ) : (
            <LendForm items={availableOptions} students={students} preselectStudent={preselect} today={today} />
          )}
        </Card>
      </div>
    </>
  )
}
