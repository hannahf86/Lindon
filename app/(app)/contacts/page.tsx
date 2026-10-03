// =============================================================================
// contacts/page.tsx — parents & guardians list with search
// Shows who each contact is linked to, and flags anyone without an email
// (they won't get reminders, invoices or messages).
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName } from '@/lib/format'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'Parents & contacts' }

export default async function ContactsPage({ searchParams }: PageProps<'/contacts'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''

  let query = db()
    .from('guardians')
    .select('id, first_name, last_name, email, phone, student_guardians(relationship, students(id, first_name, last_name))')
    .eq('teacher_id', teacher.id)
    .order('first_name')
  if (q) {
    // Escape PostgREST filter syntax characters in the search term
    const term = q.replace(/[%,()]/g, ' ')
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
  }
  const contacts = must(await query)
  const noEmail = contacts.filter((c) => !c.email).length

  return (
    <>
      <PageHeader
        title="Parents & contacts"
        subtitle="Parents and guardians of your under-18 students. Adult students keep their own email and phone on their student record."
        actions={
          <Link href="/contacts/new" className="btn">
            + Add contact
          </Link>
        }
      />

      {/* ---- Search + summary ---- */}
      <div className="spread" style={{ marginBottom: 16 }}>
        <p className="muted" style={{ margin: 0 }}>
          {contacts.length} contact{contacts.length === 1 ? '' : 's'}
          {noEmail > 0 && (
            <>
              {' · '}
              <span style={{ color: 'var(--coral-ink)', fontWeight: 700 }}>{noEmail} without an email address</span>
            </>
          )}
        </p>
        <form className="row" action="/contacts">
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Search by name, email or phone" style={{ width: 260 }} />
          <button className="btn btn-secondary" type="submit">
            Search
          </button>
        </form>
      </div>

      {/* ---- Table ---- */}
      <Card>
        {contacts.length === 0 ? (
          <EmptyState
            title={q ? 'No matches' : 'No contacts yet'}
            action={
              !q && (
                <Link href="/contacts/new" className="btn">
                  Add a parent or guardian
                </Link>
              )
            }
          >
            {q
              ? `Nobody matches “${q}”.`
              : 'Add the parents or guardians of your under-18 students so reminders and invoices reach them. You can also add them from a student’s page.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Parent / guardian of</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="rowlink" href={`/contacts/${c.id}`}>
                        {fullName(c)}
                      </Link>
                    </td>
                    <td className="small">
                      {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <Badge tone="coral">No email</Badge>}
                      {c.phone && <div>{c.phone}</div>}
                    </td>
                    <td className="small">
                      {c.student_guardians.length === 0 ? (
                        <span className="muted">Not linked to anyone</span>
                      ) : (
                        c.student_guardians.map(
                          (l, i) =>
                            l.students && (
                              <span key={l.students.id}>
                                {i > 0 && ', '}
                                <Link href={`/students/${l.students.id}`}>{fullName(l.students)}</Link>
                                {l.relationship && <span className="muted"> ({l.relationship})</span>}
                              </span>
                            ),
                        )
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
