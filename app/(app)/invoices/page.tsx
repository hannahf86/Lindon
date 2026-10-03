// =============================================================================
// invoices/page.tsx — invoice list: money owed at a glance, status filter
// tabs (All / Draft / Sent / Overdue / Paid / Void) and search.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { money } from '@/lib/format'
import { addDaysISO, fmtDate, monthBounds, todayISO } from '@/lib/dates'
import { displayStatus } from '@/lib/invoices'
import { Card, EmptyState, PageHeader, Stat, StatusBadge, TextField } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/forms'
import { ModalButton } from '@/components/modal'
import { runMonthlyInvoices } from './actions'

export const metadata: Metadata = { title: 'Invoices' }

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent (unpaid)' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
  { key: 'void', label: 'Void' },
] as const
type FilterKey = (typeof FILTERS)[number]['key']

const LIMIT = 300

export default async function InvoicesPage({ searchParams }: PageProps<'/invoices'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const status: FilterKey = FILTERS.find((f) => f.key === sp.status)?.key ?? 'all'
  const today = todayISO(teacher.timezone)
  // Default month for the monthly run: next month (billed in advance)
  const nextMonth = addDaysISO(monthBounds(today)[1], 1).slice(0, 7)
  const c = teacher.currency

  // ---- The list (filtered) ----
  let query = db()
    .from('invoices')
    .select('id, number, bill_to_name, bill_to_email, issue_date, due_date, status, total, paid_on')
    .eq('teacher_id', teacher.id)
    .order('issue_date', { ascending: false })
    .order('number', { ascending: false })
    .limit(LIMIT)
  if (status === 'overdue') query = query.eq('status', 'sent').lt('due_date', today)
  else if (status !== 'all') query = query.eq('status', status)
  if (q) {
    // Escape PostgREST filter syntax characters in the search term
    const term = q.replace(/[%,()]/g, ' ')
    query = query.or(`number.ilike.%${term}%,bill_to_name.ilike.%${term}%,bill_to_email.ilike.%${term}%`)
  }

  // ---- Totals for the tiles (unfiltered) ----
  const [invoices, unpaid, drafts] = await Promise.all([
    query.then(must),
    db().from('invoices').select('total, due_date').eq('teacher_id', teacher.id).eq('status', 'sent').then(must),
    db().from('invoices').select('total').eq('teacher_id', teacher.id).eq('status', 'draft').then(must),
  ])
  const outstanding = unpaid.reduce((sum, i) => sum + Number(i.total), 0)
  const overdueList = unpaid.filter((i) => i.due_date && i.due_date < today)
  const overdue = overdueList.reduce((sum, i) => sum + Number(i.total), 0)
  const draftTotal = drafts.reduce((sum, i) => sum + Number(i.total), 0)

  const href = (s: string) => `/invoices?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ''}`

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Bill for lessons and anything you’ve supplied — strings, books, reeds and so on."
        actions={
          <>
            <Link href="/reports" className="btn btn-secondary">
              Income reports
            </Link>
            {/* ---- Bill everyone for next month in one go ---- */}
            <ModalButton label="Create next month's invoices" title="Create next month's invoices" className="btn btn-purple">
              <ActionForm action={runMonthlyInvoices}>
                <p className="small muted" style={{ margin: 0 }}>
                  Makes a draft invoice for every active pupil with lessons booked that month that aren’t invoiced yet, and takes off any
                  make-up credits they have waiting. Nothing is sent — check the drafts, then email them.
                </p>
                <div className="form-grid">
                  <TextField label="Month to bill" name="month" type="month" defaultValue={nextMonth} required />
                  <TextField label="Invoice date" name="issue_date" type="date" defaultValue={today} />
                </div>
                <SubmitButton pendingText="Creating invoices…">Create draft invoices</SubmitButton>
              </ActionForm>
            </ModalButton>
            <Link href="/invoices/new" className="btn">
              + New invoice
            </Link>
          </>
        }
      />

      {/* ---- Money owed at a glance ---- */}
      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <Stat
          label="Outstanding"
          value={money(outstanding, c)}
          note={`${unpaid.length} sent invoice${unpaid.length === 1 ? '' : 's'} waiting for payment`}
          tone="teal"
          href="/invoices?status=sent"
        />
        <Stat
          label="Overdue"
          value={money(overdue, c)}
          note={overdueList.length ? `${overdueList.length} past the due date` : 'Nothing overdue'}
          tone={overdueList.length ? 'coral' : undefined}
          href="/invoices?status=overdue"
        />
        <Stat
          label="Drafts"
          value={money(draftTotal, c)}
          note={`${drafts.length} not sent yet`}
          tone="butter"
          href="/invoices?status=draft"
        />
      </div>

      {/* ---- Filters + search ---- */}
      <div className="spread" style={{ marginBottom: 16 }}>
        <nav className="tabs" style={{ margin: 0 }} aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href(f.key)} aria-current={f.key === status ? 'page' : undefined}>
              {f.label}
            </Link>
          ))}
        </nav>
        <form className="row" action="/invoices">
          <input type="hidden" name="status" value={status} />
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Search number or name" style={{ width: 240 }} />
          <button className="btn btn-secondary" type="submit">
            Search
          </button>
        </form>
      </div>

      {/* ---- Table ---- */}
      <Card>
        {invoices.length === 0 ? (
          <EmptyState
            title={q ? 'No matches' : status === 'all' ? 'No invoices yet' : 'Nothing here'}
            action={
              !q &&
              status === 'all' && (
                <Link href="/invoices/new" className="btn">
                  Create your first invoice
                </Link>
              )
            }
          >
            {q
              ? `No invoice matches “${q}”.`
              : status === 'all'
                ? 'Create an invoice and your lessons for the month are added for you.'
                : 'No invoices with this status.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Bill to</th>
                  <th>Issued</th>
                  <th>Due</th>
                  <th className="right">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="nowrap">
                      <Link className="rowlink" href={`/invoices/${inv.id}`}>
                        {inv.number}
                      </Link>
                    </td>
                    <td>
                      {inv.bill_to_name || <span className="muted">No name</span>}
                      {inv.bill_to_email && <div className="small muted">{inv.bill_to_email}</div>}
                    </td>
                    <td className="nowrap">{fmtDate(inv.issue_date, 'd MMM yyyy')}</td>
                    <td className="nowrap">
                      {inv.status === 'paid' && inv.paid_on ? (
                        <span className="muted">Paid {fmtDate(inv.paid_on, 'd MMM')}</span>
                      ) : inv.due_date ? (
                        fmtDate(inv.due_date, 'd MMM yyyy')
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="right nowrap">{money(inv.total, c)}</td>
                    <td>
                      <StatusBadge status={displayStatus(inv, today)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invoices.length === LIMIT && (
              <p className="small muted" style={{ marginTop: 12 }}>
                Showing the latest {LIMIT}. Use the search or the status tabs to find older invoices.
              </p>
            )}
          </div>
        )}
      </Card>
    </>
  )
}
