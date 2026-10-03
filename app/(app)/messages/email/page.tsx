// =============================================================================
// messages/email/page.tsx — "Email families" tab: email students / parents,
// plus the log of every email the app has sent (reminders, invoices, lesson
// notes, messages, family invitations and new-message alerts).
// ?to=<studentId> (from a student's page) starts with just that student ticked.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { label } from '@/lib/format'
import { fmtTz } from '@/lib/dates'
import { studentOptions } from '@/lib/queries'
import { Badge, Card, EmptyState, PageHeader, type Tone } from '@/components/ui'
import { ComposeForm } from './compose-form'
import { MessagesTabs } from '../tabs'

export const metadata: Metadata = { title: 'Email families' }

const KIND_TONES: Record<string, Tone> = {
  broadcast: 'purple',
  individual: 'sky',
  reminder: 'butter',
  invoice: 'teal',
  lesson_notes: 'plain',
  family_invite: 'purple',
  message_notice: 'plain',
}

const KIND_LABELS: Record<string, string> = {
  broadcast: 'Message',
  individual: 'One-to-one',
  family_invite: 'Family invite',
  message_notice: 'New-message alert',
}

export default async function MessagesPage({ searchParams }: PageProps<'/messages/email'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams

  const [students, activeCount, log] = await Promise.all([
    studentOptions(teacher.id),
    db().from('students').select('id', { count: 'exact', head: true }).eq('teacher_id', teacher.id).eq('status', 'active'),
    db()
      .from('email_log')
      .select('id, kind, subject, recipients, status, error, created_at')
      .eq('teacher_id', teacher.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(must),
  ])
  const preselect = typeof sp.to === 'string' && students.some((s) => s.id === sp.to) ? sp.to : undefined
  const emailMissing = !teacher.email

  return (
    <>
      <PageHeader title="Messages" subtitle="Send an email to your pupils — or their parents, for children." />
      <MessagesTabs current="email" />

      {emailMissing && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          Add your own email address in <Link href="/settings">Settings</Link> so parents can reply to you.
        </div>
      )}

      {/* ---- Compose ---- */}
      <Card title="New email">
        {students.length === 0 ? (
          <EmptyState
            title="No students yet"
            action={
              <Link href="/students/new" className="btn">
                Add a student
              </Link>
            }
          >
            Once you&apos;ve added students you can email them (or their parents) from here.
          </EmptyState>
        ) : (
          <ComposeForm students={students} preselect={preselect} activeCount={activeCount.count ?? 0} />
        )}
      </Card>

      {/* ---- Email log ---- */}
      <Card title="Sent emails" actions={<span className="small muted">Latest 50</span>}>
        {log.length === 0 ? (
          <p className="muted">Nothing sent yet. Reminders, invoices, lesson notes, emails and invitations will all appear here.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {log.map((m) => (
                  <tr key={m.id}>
                    <td className="nowrap small">{fmtTz(m.created_at, teacher.timezone, 'd MMM yyyy, HH:mm')}</td>
                    <td>
                      <Badge tone={KIND_TONES[m.kind] ?? 'plain'}>{KIND_LABELS[m.kind] ?? label(m.kind)}</Badge>
                    </td>
                    <td>{m.subject}</td>
                    <td className="small" title={m.recipients.join(', ')}>
                      {m.recipients.length === 1 ? m.recipients[0] : `${m.recipients.length} people`}
                    </td>
                    <td>
                      {m.status === 'sent' ? (
                        <Badge tone="teal">Sent</Badge>
                      ) : (
                        <>
                          <Badge tone="coral">Failed</Badge>
                          {m.error && <div className="small" style={{ color: 'var(--coral-ink)' }}>{m.error}</div>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
