// =============================================================================
// students/page.tsx — student list: search, filters, sorting
//
// Everything lives in the URL (?q=&status=&age=&instrument=&sort=&dir=), so
// a filtered list can be bookmarked and the back button works.
//   Search      name, surname, email, phone, instrument, level, notes and
//               parents' names / emails
//   Filters     status (Active · Paused · Past · All), Children / Adults,
//               an instrument, and "No parent linked"
//   Sort        pills, or click a column heading (click again to reverse).
//               Sorting by surname puts the Surname column first.
// Each row ends with a "⋯" menu: view, edit, remove.
// "Import" brings pupils over from a CSV (students/import).
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must, requireTeacher } from '@/lib/db'
import { fullName, isMinor } from '@/lib/format'
import { Badge, Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { ConfirmButton } from '@/components/forms'
import { RowMenu } from '@/components/row-menu'
import { deleteStudent } from './actions'

export const metadata: Metadata = { title: 'Students' }

const STATUSES = ['active', 'paused', 'left', 'all'] as const
// Stored status 'left' is shown to teachers as "Past"
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = { active: 'Active', paused: 'Paused', left: 'Past', all: 'All' }
const AGES = ['all', 'children', 'adults', 'no-parent'] as const
const AGE_LABELS: Record<(typeof AGES)[number], string> = { all: 'Everyone', children: 'Children', adults: 'Adults', 'no-parent': 'No parent linked' }
const SORTS = ['first', 'last', 'instrument', 'level', 'status', 'newest'] as const
type Sort = (typeof SORTS)[number]
const SORT_LABELS: Record<Sort, string> = { first: 'First name', last: 'Surname', instrument: 'Instrument', level: 'Level', status: 'Status', newest: 'Newest' }
const STATUS_ORDER: Record<string, number> = { active: 0, paused: 1, left: 2 }

type Params = { q: string; status: string; age: string; instrument: string; sort: Sort; dir: 'asc' | 'desc' }

export default async function StudentsPage({ searchParams }: PageProps<'/students'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const pick = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string).trim() : '')
  const p: Params = {
    q: pick('q'),
    status: STATUSES.find((f) => f === pick('status')) ?? 'active',
    age: AGES.find((f) => f === pick('age')) ?? 'all',
    instrument: pick('instrument'),
    sort: SORTS.find((s) => s === pick('sort')) ?? 'first',
    dir: pick('dir') === 'desc' ? 'desc' : 'asc',
  }
  const imported = Number(pick('imported')) || 0

  // All of this teacher's students (a studio is at most a few hundred), then
  // search / filter / sort here so every field can be searched
  const all = must(
    await db()
      .from('students')
      .select('id, first_name, last_name, instruments, level, status, date_of_birth, is_minor, email, phone, notes, created_at, student_guardians(guardians(first_name, last_name, email))')
      .eq('teacher_id', teacher.id),
  )

  // Instrument pills: every instrument anyone in this status plays
  const inStatus = all.filter((s) => p.status === 'all' || s.status === p.status)
  const instruments = [...new Set(inStatus.flatMap((s) => s.instruments.map((i) => i.trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b))

  // ---- Search + filters ----
  const terms = p.q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = inStatus
    .map((s) => {
      const minor = isMinor(s)
      const parents = s.student_guardians.map((l) => l.guardians).filter((g): g is NonNullable<typeof g> => Boolean(g))
      return { ...s, minor, parents }
    })
    .filter((s) => {
      if (p.age === 'children' && !s.minor) return false
      if (p.age === 'adults' && s.minor) return false
      if (p.age === 'no-parent' && !(s.minor && s.parents.length === 0)) return false
      if (p.instrument && !s.instruments.some((i) => i.trim().toLowerCase() === p.instrument.toLowerCase())) return false
      if (!terms.length) return true
      const hay = [s.first_name, s.last_name, s.email, s.phone, s.level, s.notes, ...s.instruments, ...s.parents.flatMap((g) => [g.first_name, g.last_name, g.email])]
        .join(' ')
        .toLowerCase()
      return terms.every((t) => hay.includes(t))
    })

  // ---- Sort (blanks always last) ----
  const text = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()
  const byName = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    p.sort === 'last'
      ? text(a.last_name).localeCompare(text(b.last_name)) || text(a.first_name).localeCompare(text(b.first_name))
      : text(a.first_name).localeCompare(text(b.first_name)) || text(a.last_name).localeCompare(text(b.last_name))
  const key = (s: (typeof rows)[number]): string | number => {
    if (p.sort === 'instrument') return text(s.instruments[0])
    if (p.sort === 'level') return text(s.level)
    if (p.sort === 'status') return STATUS_ORDER[s.status] ?? 9
    if (p.sort === 'newest') return -new Date(s.created_at).getTime()
    return p.sort === 'last' ? text(s.last_name) : text(s.first_name)
  }
  rows.sort((a, b) => {
    const [ka, kb] = [key(a), key(b)]
    if (ka === '' && kb !== '') return 1
    if (kb === '' && ka !== '') return -1
    const c = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb))
    return (p.dir === 'desc' ? -c : c) || byName(a, b)
  })

  // ---- Links that keep the other choices ----
  const href = (change: Partial<Params>) => {
    const next = { ...p, ...change }
    const qs = new URLSearchParams()
    if (next.q) qs.set('q', next.q)
    if (next.status !== 'active') qs.set('status', next.status)
    if (next.age !== 'all') qs.set('age', next.age)
    if (next.instrument) qs.set('instrument', next.instrument)
    if (next.sort !== 'first') qs.set('sort', next.sort)
    if (next.dir !== 'asc') qs.set('dir', next.dir)
    const s = qs.toString()
    return s ? `/students?${s}` : '/students'
  }
  // A column heading: sorts by it; clicking the current one reverses it
  const sortHead = (sort: Sort, children: string) => {
    const current = p.sort === sort
    return (
      <th key={sort} aria-sort={current ? (p.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <Link className={`sort-head${current ? ' is-current' : ''}`} href={href({ sort, dir: current && p.dir === 'asc' ? 'desc' : 'asc' })}>
          {children}
          <span aria-hidden="true">{current ? (p.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
        </Link>
      </th>
    )
  }
  const surnameFirst = p.sort === 'last'
  const filtered = p.q || p.age !== 'all' || p.instrument

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={`${rows.length} ${filtered ? 'matching' : p.status === 'all' ? '' : STATUS_LABELS[p.status as keyof typeof STATUS_LABELS].toLowerCase()} student${rows.length === 1 ? '' : 's'}`}
        actions={
          <span className="row" style={{ gap: 8 }}>
            <Link href="/students/import" className="btn btn-secondary">
              Import from CSV
            </Link>
            <Link href="/students/new" className="btn">
              + Add student
            </Link>
          </span>
        }
      />

      {/* ---- Just imported ---- */}
      {imported > 0 && (
        <div className="alert alert-ok" role="status" style={{ marginBottom: 16 }}>
          {imported} pupil{imported === 1 ? '' : 's'} imported. Book their regular lessons from each pupil’s page.
        </div>
      )}

      {/* ---- Search ---- */}
      <form className="student-search" action="/students">
        {p.status !== 'active' && <input type="hidden" name="status" value={p.status} />}
        {p.age !== 'all' && <input type="hidden" name="age" value={p.age} />}
        {p.instrument && <input type="hidden" name="instrument" value={p.instrument} />}
        {p.sort !== 'first' && <input type="hidden" name="sort" value={p.sort} />}
        {p.dir !== 'asc' && <input type="hidden" name="dir" value={p.dir} />}
        <input
          className="input"
          type="search"
          name="q"
          defaultValue={p.q}
          placeholder="Search names, parents, emails, instruments, notes…"
          aria-label="Search students"
        />
        <button className="btn btn-secondary" type="submit">
          Search
        </button>
        {filtered && (
          <Link href={href({ q: '', age: 'all', instrument: '' })} className="btn btn-ghost">
            Clear
          </Link>
        )}
      </form>

      {/* ---- Filters + sort ---- */}
      <div className="student-filters">
        <div className="filter-row">
          <span className="filter-label">Status</span>
          <nav className="tabs tabs-sm" aria-label="Filter by status">
            {STATUSES.map((f) => (
              <Link key={f} href={href({ status: f, instrument: '' })} aria-current={f === p.status ? 'page' : undefined}>
                {STATUS_LABELS[f]}
              </Link>
            ))}
          </nav>
        </div>
        <div className="filter-row">
          <span className="filter-label">Who</span>
          <nav className="tabs tabs-sm" aria-label="Filter by age">
            {AGES.map((f) => (
              <Link key={f} href={href({ age: f })} aria-current={f === p.age ? 'page' : undefined}>
                {AGE_LABELS[f]}
              </Link>
            ))}
          </nav>
        </div>
        {instruments.length > 1 && (
          <div className="filter-row">
            <span className="filter-label">Instrument</span>
            <nav className="tabs tabs-sm" aria-label="Filter by instrument">
              <Link href={href({ instrument: '' })} aria-current={!p.instrument ? 'page' : undefined}>
                All
              </Link>
              {instruments.map((i) => (
                <Link key={i} href={href({ instrument: i })} aria-current={p.instrument.toLowerCase() === i.toLowerCase() ? 'page' : undefined}>
                  {i}
                </Link>
              ))}
            </nav>
          </div>
        )}
        <div className="filter-row">
          <span className="filter-label">Sort by</span>
          <nav className="tabs tabs-sm" aria-label="Sort by">
            {SORTS.map((s) => (
              <Link key={s} href={href({ sort: s, dir: 'asc' })} aria-current={s === p.sort ? 'page' : undefined}>
                {SORT_LABELS[s]}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      {/* ---- Table ---- */}
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'No matches' : 'No students here yet'}
            action={
              filtered ? (
                <Link href={href({ q: '', age: 'all', instrument: '' })} className="btn btn-secondary">
                  Clear search and filters
                </Link>
              ) : (
                <Link href="/students/new" className="btn">
                  Add your first student
                </Link>
              )
            }
          >
            {filtered ? 'Nobody matches that search and those filters.' : 'Add a student to start booking lessons.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {surnameFirst ? (
                    <>
                      {sortHead('last', 'Surname')}
                      {sortHead('first', 'First name')}
                    </>
                  ) : (
                    <>
                      {sortHead('first', 'First name')}
                      {sortHead('last', 'Surname')}
                    </>
                  )}
                  {sortHead('instrument', 'Instruments')}
                  {sortHead('level', 'Level')}
                  <th>Contact</th>
                  {sortHead('status', 'Status')}
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const parentNames = s.parents.map((g) => fullName(g)).filter(Boolean)
                  const first = (
                    <Link className="rowlink" href={`/students/${s.id}`}>
                      {s.first_name}
                    </Link>
                  )
                  const last = s.last_name ? (
                    <Link className="rowlink" href={`/students/${s.id}`}>
                      {s.last_name}
                    </Link>
                  ) : (
                    <span className="muted">—</span>
                  )
                  return (
                    <tr key={s.id}>
                      {surnameFirst ? (
                        <>
                          <td>{last}</td>
                          <td>
                            {first} <AgeBadge minor={s.minor} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{first}</td>
                          <td>
                            {last} <AgeBadge minor={s.minor} />
                          </td>
                        </>
                      )}
                      <td>{s.instruments.join(', ') || <span className="muted">—</span>}</td>
                      <td>{s.level || <span className="muted">—</span>}</td>
                      <td className="small">
                        {s.minor ? (
                          parentNames.length ? (
                            parentNames.join(', ')
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
                      {/* ---- Row menu: view · edit · remove ---- */}
                      <td className="row-actions">
                        <RowMenu label={`Options for ${fullName(s)}`}>
                          <Link role="menuitem" href={`/students/${s.id}`}>
                            View student
                          </Link>
                          <Link role="menuitem" href={`/students/${s.id}/edit`}>
                            Edit details
                          </Link>
                          <ConfirmButton
                            action={deleteStudent.bind(null, s.id)}
                            confirm={`Remove ${fullName(s)}? This deletes their lessons, bookings, invoices (paid ones too) and parent links for good. If they've just stopped for now, set their status to Paused or Past instead — that keeps everything.`}
                            className="danger"
                          >
                            Remove student
                          </ConfirmButton>
                        </RowMenu>
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

// ---- Child / Adult badge -----------------------------------------------------------------------
function AgeBadge({ minor }: { minor: boolean }) {
  return minor ? <Badge tone="butter">Child</Badge> : <Badge tone="purple">Adult</Badge>
}
