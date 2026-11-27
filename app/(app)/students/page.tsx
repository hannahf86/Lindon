// =============================================================================
// students/page.tsx — student list: search, filters, sorting
//
// Everything lives in the URL (?q=&status=&instrument=&sort=&dir=&per=&page=), so
// a filtered list can be bookmarked and the back button works.
//   Search      name, surname, email, phone, instrument, level, notes and
//               parents' names / emails
//   Filters     status pills (Active · Paused · Past · All); an instrument
//               dropdown (approved exception, Hannah's call 2026-11-27)
//   Sort        a dropdown, or click a column heading (click again to reverse).
//               Sorting by surname puts the Surname column first.
//   Pages       10, 25 or 50 pupils a page (25 to start). Changing a search,
//               filter or sort goes back to page 1.
//   Columns     First name · Surname · Main contact · Contact email. The main
//               contact is a child's main parent, or an adult pupil themselves.
//               Paused / Past pupils get a small status badge by their name.
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
import { LinkSelect } from '@/components/link-select'
import { deleteStudent } from './actions'

export const metadata: Metadata = { title: 'Students' }

const STATUSES = ['active', 'paused', 'left', 'all'] as const
// Stored status 'left' is shown to teachers as "Past"
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = { active: 'Active', paused: 'Paused', left: 'Past', all: 'All' }
const SORTS = ['first', 'last', 'contact', 'newest'] as const
type Sort = (typeof SORTS)[number]
const SORT_LABELS: Record<Sort, string> = { first: 'First name', last: 'Surname', contact: 'Main contact', newest: 'Newest' }

const PER_PAGE = [10, 25, 50] as const
type Params = { q: string; status: string; instrument: string; sort: Sort; dir: 'asc' | 'desc'; per: number; page: number }

export default async function StudentsPage({ searchParams }: PageProps<'/students'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const pick = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string).trim() : '')
  const p: Params = {
    q: pick('q'),
    status: STATUSES.find((f) => f === pick('status')) ?? 'active',
    instrument: pick('instrument'),
    sort: SORTS.find((s) => s === pick('sort')) ?? 'first',
    dir: pick('dir') === 'desc' ? 'desc' : 'asc',
    per: PER_PAGE.find((n) => String(n) === pick('per')) ?? 25,
    page: Math.max(1, Math.floor(Number(pick('page'))) || 1),
  }
  const imported = Number(pick('imported')) || 0

  // All of this teacher's students (a studio is at most a few hundred), then
  // search / filter / sort here so every field can be searched
  const all = must(
    await db()
      .from('students')
      .select('id, first_name, last_name, instruments, level, status, date_of_birth, is_minor, email, phone, notes, created_at, student_guardians(is_primary, guardians(first_name, last_name, email))')
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
      // Main parent first
      const links = [...s.student_guardians].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      const parents = links.map((l) => l.guardians).filter((g): g is NonNullable<typeof g> => Boolean(g))
      // Main contact: a child's main parent; an adult pupil themselves
      const contact = minor ? (parents[0] ? { name: fullName(parents[0]), email: parents[0].email } : null) : { name: fullName(s), email: s.email }
      return { ...s, minor, parents, contact }
    })
    .filter((s) => {
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
    if (p.sort === 'contact') return text(s.contact?.name)
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

  // ---- This page ----
  const pages = Math.max(1, Math.ceil(rows.length / p.per))
  const page = Math.min(p.page, pages)
  const shown = rows.slice((page - 1) * p.per, page * p.per)

  // ---- Links that keep the other choices ----
  const href = (change: Partial<Params>) => {
    // Anything but a page change starts again from page 1
    const next = { ...p, page: 1, ...change }
    const qs = new URLSearchParams()
    if (next.q) qs.set('q', next.q)
    if (next.status !== 'active') qs.set('status', next.status)
    if (next.instrument) qs.set('instrument', next.instrument)
    if (next.sort !== 'first') qs.set('sort', next.sort)
    if (next.dir !== 'asc') qs.set('dir', next.dir)
    if (next.per !== 25) qs.set('per', String(next.per))
    if (next.page > 1) qs.set('page', String(next.page))
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
  const filtered = p.q || p.instrument

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
        {p.instrument && <input type="hidden" name="instrument" value={p.instrument} />}
        {p.sort !== 'first' && <input type="hidden" name="sort" value={p.sort} />}
        {p.dir !== 'asc' && <input type="hidden" name="dir" value={p.dir} />}
        {p.per !== 25 && <input type="hidden" name="per" value={p.per} />}
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
          <Link href={href({ q: '', instrument: '' })} className="btn btn-ghost">
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
          {instruments.length > 1 && (
            <LinkSelect
              id="filter-instrument"
              label="Instrument"
              value={href({ instrument: instruments.find((i) => i.toLowerCase() === p.instrument.toLowerCase()) ?? '' })}
              options={[{ href: href({ instrument: '' }), label: 'All instruments' }, ...instruments.map((i) => ({ href: href({ instrument: i }), label: i }))]}
            />
          )}
          <LinkSelect id="filter-sort" label="Sort by" value={href({})} options={SORTS.map((x) => ({ href: href({ sort: x, dir: x === p.sort ? p.dir : 'asc' }), label: SORT_LABELS[x] }))} />
        </div>
      </div>

      {/* ---- Table ---- */}
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? 'No matches' : 'No students here yet'}
            action={
              filtered ? (
                <Link href={href({ q: '', instrument: '' })} className="btn btn-secondary">
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
                  {sortHead('contact', 'Main contact')}
                  <th>Contact email</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => {
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
                            {first} <AgeBadge minor={s.minor} status={s.status} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{first}</td>
                          <td>
                            {last} <AgeBadge minor={s.minor} status={s.status} />
                          </td>
                        </>
                      )}
                      <td>
                        {s.contact ? (
                          <>
                            {s.contact.name}
                            {!s.minor && <span className="small muted"> (adult pupil)</span>}
                          </>
                        ) : (
                          <span style={{ color: 'var(--coral-ink)', fontWeight: 700 }}>No parent linked</span>
                        )}
                      </td>
                      <td className="small">
                        {s.contact?.email ? <a href={`mailto:${s.contact.email}`}>{s.contact.email}</a> : <span className="muted">No email</span>}
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

        {/* ---- Pages + how many per page ---- */}
        {rows.length > 0 && (
          <div className="pager">
            <span className="small muted">
              {rows.length > p.per ? `Showing ${(page - 1) * p.per + 1}–${Math.min(page * p.per, rows.length)} of ${rows.length}` : `${rows.length} pupil${rows.length === 1 ? '' : 's'}`}
            </span>
            {pages > 1 && (
              <nav className="pager-pages" aria-label="Pages">
                {page > 1 ? (
                  <Link className="pager-btn" href={href({ page: page - 1 })} rel="prev">
                    ‹ Previous
                  </Link>
                ) : (
                  <span className="pager-btn is-off">‹ Previous</span>
                )}
                {pageList(page, pages).map((n, i) =>
                  n === 0 ? (
                    <span key={`gap${i}`} className="pager-gap">
                      …
                    </span>
                  ) : (
                    <Link key={n} className="pager-btn" href={href({ page: n })} aria-current={n === page ? 'page' : undefined}>
                      {n}
                    </Link>
                  ),
                )}
                {page < pages ? (
                  <Link className="pager-btn" href={href({ page: page + 1 })} rel="next">
                    Next ›
                  </Link>
                ) : (
                  <span className="pager-btn is-off">Next ›</span>
                )}
              </nav>
            )}
            <span className="row" style={{ gap: 8 }}>
              <span className="small muted">Per page</span>
              <nav className="tabs tabs-sm" aria-label="Pupils per page">
                {PER_PAGE.map((n) => (
                  <Link key={n} href={href({ per: n })} aria-current={n === p.per ? 'page' : undefined}>
                    {n}
                  </Link>
                ))}
              </nav>
            </span>
          </div>
        )}
      </Card>
    </>
  )
}

// ---- Page numbers: first, last, and two either side of the current one (0 = "…") ----
function pageList(page: number, pages: number): number[] {
  const want = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= pages))
  const sorted = [...want].sort((a, b) => a - b)
  const out: number[] = []
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(0)
    out.push(n)
  })
  return out
}

// ---- Child / Adult badge -----------------------------------------------------------------------
// (plus Paused / Past, so they stand out when looking at everyone)
function AgeBadge({ minor, status }: { minor: boolean; status: string }) {
  return (
    <>
      {minor ? <Badge tone="butter">Child</Badge> : <Badge tone="purple">Adult</Badge>}
      {status !== 'active' && (
        <>
          {' '}
          <StatusBadge status={status} />
        </>
      )}
    </>
  )
}
