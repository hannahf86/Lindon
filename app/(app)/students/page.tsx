// =============================================================================
// students/page.tsx — student list with search + status filter
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName, isMinor } from '@/lib/format'
import { Badge, Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui'

export const metadata: Metadata = { title: 'Students' }

const FILTERS = ['active', 'paused', 'left', 'all'] as const

export default async function StudentsPage({ searchParams }: PageProps<'/students'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const q = typeof sp.q === 'string' ? sp.q.trim() : ''
  const status = FILTERS.find((f) => f === sp.status) ?? 'active'

  let query = db()
    .from('students')
    .select('id, first_name, last_name, instruments, level, status, date_of_birth, is_minor, email, student_guardians(guardians(first_name, last_name))')
    .eq('teacher_id', teacher.id)
    .order('first_name')
  if (status !== 'all') query = query.eq('status', status)
  if (q) {
    // Escape PostgREST filter syntax characters in the search term
    const term = q.replace(/[%,()]/g, ' ')
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`)
  }
  const students = must(await query)

  const href = (s: string) => `/students?status=${s}${q ? `&q=${encodeURIComponent(q)}` : ''}`

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={`${students.length} ${status === 'all' ? '' : status} student${students.length === 1 ? '' : 's'}`}
        actions={
          <Link href="/students/new" className="btn">
            + Add student
          </Link>
        }
      />

      {/* ---- Filters ---- */}
      <div className="spread" style={{ marginBottom: 16 }}>
        <nav className="tabs" style={{ margin: 0 }} aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Link key={f} href={href(f)} aria-current={f === status ? 'page' : undefined}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Link>
          ))}
        </nav>
        <form className="row" action="/students">
          <input type="hidden" name="status" value={status} />
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Search by name or email" style={{ width: 240 }} />
          <button className="btn btn-secondary" type="submit">
            Search
          </button>
        </form>
      </div>

      {/* ---- Table ---- */}
      <Card>
        {students.length === 0 ? (
          <EmptyState
            title={q ? 'No matches' : 'No students here yet'}
            action={
              !q && (
                <Link href="/students/new" className="btn">
                  Add your first student
                </Link>
              )
            }
          >
            {q ? `Nobody matches “${q}”.` : 'Add a student to start booking lessons.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Instruments</th>
                  <th>Level</th>
                  <th>Contact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const minor = isMinor(s)
                  const parents = s.student_guardians.map((l) => l.guardians && fullName(l.guardians)).filter(Boolean)
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link className="rowlink" href={`/students/${s.id}`}>
                          {fullName(s)}
                        </Link>{' '}
                        {minor ? <Badge tone="butter">Child</Badge> : <Badge tone="purple">Adult</Badge>}
                      </td>
                      <td>{s.instruments.join(', ') || <span className="muted">—</span>}</td>
                      <td>{s.level || <span className="muted">—</span>}</td>
                      <td className="small">
                        {minor ? (
                          parents.length ? (
                            parents.join(', ')
                          ) : (
                            <span style={{ color: 'var(--coral-ink)', fontWeight: 700 }}>No parent linked</span>
                          )
                        ) : (
                          s.email || <span className="muted">No email</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
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
