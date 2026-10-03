// =============================================================================
// reports/page.tsx — income reports: choose a period (quick links or typed
// dates), see money received / invoiced / outstanding, a month-by-month table
// with simple bars, lessons vs equipment, top payers and teaching hours.
// Calculations live in lib/reports.ts.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireTeacher } from '@/lib/db'
import { money } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { incomeReport, periodLabel, presets, resolvePeriod } from '@/lib/reports'
import { Card, EmptyState, PageHeader, Stat } from '@/components/ui'

export const metadata: Metadata = { title: 'Income reports' }

/** A plain CSS bar: width is the share of the biggest value. */
function Bar({ value, max, colour = 'var(--teal)' }: { value: number; max: number; colour?: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 2 : 0, Math.round((value / max) * 100)) : 0
  return (
    <div style={{ background: 'var(--line-soft)', borderRadius: 999, height: 12, minWidth: 80 }} aria-hidden>
      <div style={{ width: `${pct}%`, background: colour, height: '100%', borderRadius: 999 }} />
    </div>
  )
}

const KIND_COLOURS = { lesson: 'var(--teal)', equipment: 'var(--butter)', other: 'var(--purple)', credit: 'var(--coral)' } as const

export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const c = teacher.currency
  const today = todayISO(teacher.timezone)
  const quick = presets(today)
  const period = resolvePeriod(sp, today)
  const r = await incomeReport(teacher, period)

  const qs = (p: { from: string; to: string }) => `from=${p.from}&to=${p.to}`
  const maxMonth = Math.max(0, ...r.months.map((m) => m.received))
  const maxKind = Math.max(0, ...r.byKind.map((k) => k.amount))
  const hours = Math.floor(r.minutesTaught / 60)
  const mins = r.minutesTaught % 60
  const topPayers = r.byStudent.slice(0, 15)

  return (
    <>
      <PageHeader
        title="Income reports"
        subtitle={periodLabel(period)}
        actions={
          <a className="btn btn-secondary" href={`/reports/export?${qs(period)}`} download>
            Download CSV
          </a>
        }
      />

      {/* ---- Period chooser ---- */}
      <Card className="no-print">
        <nav className="tabs" aria-label="Quick periods" style={{ marginBottom: 14 }}>
          {quick.map((p) => (
            <Link key={p.key} href={`/reports?${qs(p)}`} aria-current={p.from === period.from && p.to === period.to ? 'page' : undefined}>
              {p.label}
            </Link>
          ))}
        </nav>
        <form className="row" action="/reports" style={{ alignItems: 'flex-end' }}>
          <label className="field">
            <span className="field-label">From</span>
            <input className="input" type="date" name="from" defaultValue={period.from} required />
          </label>
          <label className="field">
            <span className="field-label">To</span>
            <input className="input" type="date" name="to" defaultValue={period.to} required />
          </label>
          <button className="btn btn-secondary" type="submit">
            Show
          </button>
        </form>
        <p className="small muted" style={{ margin: '10px 0 0' }}>
          UK tax years run from 6 April to 5 April.
        </p>
      </Card>

      {/* ---- Headline numbers ---- */}
      <div className="grid grid-4" style={{ margin: '20px 0' }}>
        <Stat label="Received" value={money(r.received, c)} note={`${r.paidCount} invoice${r.paidCount === 1 ? '' : 's'} paid in this period`} tone="teal" />
        <Stat label="Invoiced" value={money(r.invoiced, c)} note={`${r.invoicedCount} issued in this period (not void)`} />
        <Stat
          label="Outstanding now"
          value={money(r.outstanding, c)}
          note={`${r.outstandingCount} sent and unpaid`}
          tone={r.outstandingCount ? 'butter' : undefined}
          href="/invoices?status=sent"
        />
        <Stat
          label="Lessons taught"
          value={r.lessonsTaught}
          note={`${hours} hr${mins ? ` ${mins} min` : ''} of completed lessons`}
          tone="purple"
        />
      </div>

      <div className="split">
        {/* ---- Month by month ---- */}
        <Card title="Received each month">
          {r.months.length === 0 ? (
            <p className="muted">No months in this period.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ width: '55%' }}>
                      <span className="sr-only">Bar</span>
                    </th>
                    <th className="right">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {r.months.map((m) => (
                    <tr key={m.month}>
                      <td className="nowrap">{m.label}</td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <Bar value={m.received} max={maxMonth} />
                      </td>
                      <td className="right nowrap">{m.received ? money(m.received, c) : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total</td>
                    <td className="right nowrap">{money(r.received, c)}</td>
                  </tr>
                </tfoot>
              </table>
              {r.months.length === 36 && <p className="small muted">Showing the first 36 months — choose a shorter period to see the rest.</p>}
            </div>
          )}
        </Card>

        <div className="stack">
          {/* ---- Lessons vs equipment ---- */}
          <Card title="What you were paid for">
            {r.received === 0 ? (
              <p className="muted">Nothing paid in this period yet.</p>
            ) : (
              <ul className="list">
                {r.byKind.map((k) => (
                  <li key={k.kind}>
                    <div className="spread" style={{ marginBottom: 6 }}>
                      <strong>{k.label}</strong>
                      <span>
                        {money(k.amount, c)}
                        <span className="small muted"> · {r.received ? Math.round((k.amount / r.received) * 100) : 0}%</span>
                      </span>
                    </div>
                    <Bar value={k.amount} max={maxKind} colour={KIND_COLOURS[k.kind]} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---- Top payers ---- */}
          <Card title="By student">
            {topPayers.length === 0 ? (
              <EmptyState title="No payments yet">When you mark invoices as paid they’ll show up here.</EmptyState>
            ) : (
              <ul className="list">
                {topPayers.map((s) => (
                  <li key={s.key} className="spread">
                    <span>
                      {s.studentId ? (
                        <Link href={`/students/${s.studentId}`} style={{ fontWeight: 800 }}>
                          {s.name}
                        </Link>
                      ) : (
                        <strong>{s.name}</strong>
                      )}
                      <span className="small muted">
                        {' '}
                        · {s.invoices} invoice{s.invoices === 1 ? '' : 's'}
                      </span>
                    </span>
                    <strong>{money(s.amount, c)}</strong>
                  </li>
                ))}
              </ul>
            )}
            {r.byStudent.length > topPayers.length && (
              <p className="small muted">…and {r.byStudent.length - topPayers.length} more. The CSV download has everything.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
