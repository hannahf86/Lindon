// =============================================================================
// settings/access/page.tsx — Access requests (admins only)
// New teachers asking to join while Lindon is invite-only. Pending first.
// =============================================================================
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { auth } from '@/auth'
import { requireTeacher } from '@/lib/db'
import { db } from '@/lib/admin'
import { isAdmin } from '@/lib/access'
import { fmtTz } from '@/lib/dates'
import { ConfirmButton } from '@/components/forms'
import { Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { decideRequest } from './actions'

export const metadata: Metadata = { title: 'Access requests' }

export default async function AccessRequestsPage() {
  const [teacher, session] = await Promise.all([requireTeacher(), auth()])
  if (!isAdmin(session?.user?.email)) notFound()
  const { data } = await db().from('access_requests').select('*').order('created_at', { ascending: false }).limit(200)
  const rows = data ?? []
  const pending = rows.filter((r) => r.status === 'pending')
  const decided = rows.filter((r) => r.status !== 'pending')
  const tz = teacher.timezone

  const list = (items: typeof rows, actions: boolean) => (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Teacher</th>
            <th>Studio</th>
            <th>Teaches</th>
            <th>Asked</th>
            <th>{actions ? '' : 'Status'}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.name || '—'}</strong>
                <div className="small muted">{r.email}</div>
              </td>
              <td>{r.studio || <span className="muted">—</span>}</td>
              <td className="small">{r.teaches || <span className="muted">—</span>}</td>
              <td className="nowrap small">{fmtTz(r.created_at, tz, 'd MMM, HH:mm')}</td>
              <td className="nowrap">
                {actions ? (
                  <span className="row" style={{ gap: 6 }}>
                    <ConfirmButton action={decideRequest.bind(null, r.id, 'approved')} confirm={`Approve ${r.email}? They'll be emailed a link to sign in.`} className="btn btn-sm">
                      Approve
                    </ConfirmButton>
                    <ConfirmButton action={decideRequest.bind(null, r.id, 'declined')} confirm={`Decline ${r.email}? They won't be emailed.`} className="btn btn-ghost btn-sm">
                      Decline
                    </ConfirmButton>
                  </span>
                ) : (
                  <StatusBadge status={r.status === 'approved' ? 'active' : 'void'} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <>
      <PageHeader title="Access requests" back={{ href: '/settings', label: 'Settings' }} subtitle="Teachers asking to join Lindon while it's invite-only." />
      {/* ---- Waiting for a decision ---- */}
      <Card title={`Waiting (${pending.length})`}>
        {pending.length ? list(pending, true) : <EmptyState title="No new requests">New teachers appear here when they use “Create an account”.</EmptyState>}
      </Card>
      {/* ---- Already decided ---- */}
      {decided.length > 0 && <Card title="Decided">{list(decided, false)}</Card>}
    </>
  )
}
