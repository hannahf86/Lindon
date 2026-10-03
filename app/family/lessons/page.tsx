// =============================================================================
// app/family/lessons/page.tsx — a family's lessons: Upcoming / Past
//
// ?view=past switches tabs; ?pupil=<id> narrows to one child (only accepted
// if canSeePupil() says so). Past lessons show the teacher's notes and
// homework. Prices are never shown here.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, must } from '@/lib/db'
import { canSeePupil, requireFamily, type FamilyLink } from '@/lib/family'
import { duration } from '@/lib/format'
import { fmtTz } from '@/lib/dates'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { lessonBadge, pupilNames, studioLine } from '../_lib/family-data'

export const metadata: Metadata = { title: 'Lessons' }

const LIMIT = 50

export default async function FamilyLessonsPage({ searchParams }: PageProps<'/family/lessons'>) {
  const ctx = await requireFamily()
  const sp = await searchParams
  const view = sp.view === 'past' ? 'past' : 'upcoming'

  // ---- Pupil filter (validated against their access) ----
  const allPupils = ctx.links.flatMap((link) => link.pupils.map((p) => ({ ...p, link })))
  const rawPupil = typeof sp.pupil === 'string' ? sp.pupil : ''
  const pupilLink = rawPupil ? ctx.links.find((l) => canSeePupil(ctx, l.teacher.id, rawPupil)) : undefined
  const pupil = pupilLink ? rawPupil : null
  const manyTeachers = ctx.links.length > 1

  // ---- Lessons per teacher link, scoped to that link's pupils ----
  const now = new Date().toISOString()
  const perLink = await Promise.all(
    ctx.links.map(async (link) => {
      const ids = pupil ? link.studentIds.filter((id) => id === pupil) : link.studentIds
      if (ids.length === 0) return []
      const q = db()
        .from('lessons')
        .select('id, student_id, starts_at, duration_minutes, instrument, location, status, notes, homework')
        .eq('teacher_id', link.teacher.id)
        .in('student_id', ids)
      const rows = must(
        await (view === 'past'
          ? q.lt('starts_at', now).order('starts_at', { ascending: false }).limit(LIMIT)
          : q.gte('starts_at', now).order('starts_at').limit(LIMIT)),
      )
      return rows.map((l) => ({ ...l, link }))
    }),
  )
  const lessons = perLink
    .flat()
    .sort((a, b) => (view === 'past' ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at)))
    .slice(0, LIMIT)

  const href = (v: string, p: string | null) => {
    const qs = new URLSearchParams()
    if (v === 'past') qs.set('view', 'past')
    if (p) qs.set('pupil', p)
    const s = qs.toString()
    return `/family/lessons${s ? `?${s}` : ''}`
  }
  const nameOf = (link: FamilyLink, id: string) => pupilNames(link).get(id) ?? ''

  return (
    <>
      <PageHeader title="Lessons" subtitle="Times are shown in your teacher’s local time." />

      {/* ---- Upcoming / Past tabs ---- */}
      <nav className="tabs" aria-label="Which lessons">
        <Link href={href('upcoming', pupil)} aria-current={view === 'upcoming' ? 'page' : undefined}>
          Upcoming
        </Link>
        <Link href={href('past', pupil)} aria-current={view === 'past' ? 'page' : undefined}>
          Past lessons & notes
        </Link>
      </nav>

      {/* ---- Pupil filter chips (only with more than one pupil) ---- */}
      {allPupils.length > 1 && (
        <nav className="tabs" aria-label="Pupil" style={{ marginTop: -8 }}>
          <Link href={href(view, null)} aria-current={!pupil ? 'page' : undefined}>
            Everyone
          </Link>
          {allPupils.map((p) => (
            <Link key={p.id} href={href(view, p.id)} aria-current={pupil === p.id ? 'page' : undefined}>
              {p.first_name}
              {manyTeachers && <span style={{ fontWeight: 600 }}> · {p.link.teacher.display_name || p.link.teacher.business_name}</span>}
            </Link>
          ))}
        </nav>
      )}

      {/* ---- Lesson list ---- */}
      <Card>
        {lessons.length === 0 ? (
          <EmptyState title={view === 'past' ? 'No past lessons yet' : 'No lessons booked'}>
            {view === 'past'
              ? 'Once lessons have taken place, your teacher’s notes and homework will show here.'
              : 'Your teacher hasn’t booked any upcoming lessons yet. Send them a message if you have a question.'}
          </EmptyState>
        ) : (
          <ul className="list">
            {lessons.map((l) => {
              const tz = l.link.teacher.timezone
              const b = lessonBadge(l.status)
              const cancelled = l.status === 'notice_given' || l.status === 'teacher_cancelled'
              const name = allPupils.length > 1 ? nameOf(l.link, l.student_id) : ''
              return (
                <li key={l.id} style={{ padding: '14px 0' }}>
                  <div className="spread">
                    <div style={{ textDecoration: cancelled ? 'line-through' : undefined, opacity: cancelled ? 0.75 : undefined }}>
                      <strong>{fmtTz(l.starts_at, tz, 'EEEE d MMMM yyyy')}</strong>
                      <span className="muted"> · {fmtTz(l.starts_at, tz, 'HH:mm')} · {duration(l.duration_minutes)}</span>
                    </div>
                    <Badge tone={b.tone}>{b.text}</Badge>
                  </div>
                  <div className="small muted">
                    {[name, l.instrument, l.location, manyTeachers ? studioLine(l.link.teacher) : ''].filter(Boolean).join(' · ')}
                  </div>
                  {cancelled && view === 'upcoming' && (
                    <div className="small" style={{ color: 'var(--coral-ink)', fontWeight: 700, marginTop: 4 }}>
                      This lesson has been cancelled.
                    </div>
                  )}

                  {/* Notes + homework (past lessons only) */}
                  {view === 'past' && l.notes.trim() && (
                    <div style={{ marginTop: 8 }}>
                      <div className="eyebrow">Lesson notes</div>
                      <div className="pre">{l.notes}</div>
                    </div>
                  )}
                  {view === 'past' && l.homework.trim() && (
                    <div style={{ marginTop: 8, background: 'var(--butter-wash)', borderRadius: 12, padding: '8px 12px' }}>
                      <div className="eyebrow">Homework</div>
                      <div className="pre">{l.homework}</div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {lessons.length === LIMIT && <p className="small muted" style={{ marginTop: 12 }}>Showing the {view === 'past' ? 'most recent' : 'next'} {LIMIT} lessons.</p>}
      </Card>
    </>
  )
}
