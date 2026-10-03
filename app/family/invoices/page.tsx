// =============================================================================
// app/family/invoices/page.tsx — a family's invoices (sent and paid only)
//
// Drafts and void invoices are never shown. Each teacher's invoices are
// fetched separately, scoped to that teacher and the pupils this person may see.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must } from '@/lib/db'
import { requireFamily, type FamilyLink } from '@/lib/family'
import { money } from '@/lib/format'
import { fmtDate, todayISO } from '@/lib/dates'
import { displayStatus } from '@/lib/invoices'
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { pupilNames, studioLine } from '../_lib/family-data'

export const metadata: Metadata = { title: 'Invoices' }

async function invoicesFor(link: FamilyLink) {
  if (link.studentIds.length === 0) return []
  return must(
    await db()
      .from('invoices')
      .select('id, number, student_id, issue_date, due_date, total, status')
      .eq('teacher_id', link.teacher.id)
      .in('student_id', link.studentIds)
      .in('status', ['sent', 'paid'])
      .order('issue_date', { ascending: false })
      .limit(200),
  )
}

export default async function FamilyInvoicesPage() {
  const ctx = await requireFamily()
  const lists = await Promise.all(ctx.links.map(invoicesFor))
  const many = ctx.links.length > 1

  return (
    <>
      <PageHeader title="Invoices" subtitle="Your invoices for lessons and anything else from your teacher." />

      {/* ---- One card per teacher ---- */}
      <div className="stack">
        {ctx.links.map((link, i) => {
          const rows = lists[i]
          const today = todayISO(link.teacher.timezone)
          const names = pupilNames(link)
          const showPupil = link.pupils.length > 1
          return (
            <Card key={link.accessId} title={many ? studioLine(link.teacher) : undefined}>
              {rows.length === 0 ? (
                <EmptyState title="No invoices yet">When your teacher sends you an invoice, it’ll appear here.</EmptyState>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Invoice</th>
                        {showPupil && <th>Pupil</th>}
                        <th>Issued</th>
                        <th>Due</th>
                        <th className="right">Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((inv) => (
                        <tr key={inv.id}>
                          <td>
                            <Link className="rowlink" href={`/family/invoices/${inv.id}`}>
                              {inv.number}
                            </Link>
                          </td>
                          {showPupil && <td>{inv.student_id ? names.get(inv.student_id) : ''}</td>}
                          <td className="nowrap">{fmtDate(inv.issue_date, 'd MMM yyyy')}</td>
                          <td className="nowrap">{inv.due_date ? fmtDate(inv.due_date, 'd MMM yyyy') : '—'}</td>
                          <td className="right nowrap">{money(inv.total, link.teacher.currency)}</td>
                          <td>
                            <StatusBadge status={displayStatus(inv, today)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
