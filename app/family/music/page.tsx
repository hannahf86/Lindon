// =============================================================================
// family/music/page.tsx — "Music": files the teacher has shared with this
// family's children (or with everyone) — sheet music, scans, backing tracks
//
// Grouped by teacher when there's more than one. Each file downloads through
// /family/music/<id>, which checks access first. Only teachers with the
// "Music & files" feature (sheets) switched on appear here.
// =============================================================================
import type { Metadata } from 'next'
import { requireFamily, teacherName } from '@/lib/family'
import { has } from '@/lib/features'
import { fmtDate } from '@/lib/dates'
import { FILE_TYPES, filesForPupils, sizeText } from '@/lib/shared-files'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'Music' }

export default async function FamilyMusicPage() {
  const ctx = await requireFamily()
  const links = ctx.links.filter((l) => has(l.teacher, 'sheets') && l.studentIds.length > 0)
  const perLink = await Promise.all(links.map((l) => filesForPupils(l.teacher.id, l.studentIds)))
  const many = links.length > 1
  const names = (l: (typeof links)[number]) => new Map(l.pupils.map((p) => [p.id, p.first_name]))

  return (
    <>
      <PageHeader title="Music" subtitle="Sheet music and practice files from your teacher." />
      {links.length === 0 || perLink.every((f) => f.length === 0) ? (
        <Card>
          <EmptyState title="Nothing here yet">When your teacher shares music or practice files, they’ll appear here to download.</EmptyState>
        </Card>
      ) : (
        <div className="stack" style={{ gap: 24 }}>
          {links.map((l, i) =>
            perLink[i].length === 0 ? null : (
              <Card key={l.accessId} title={many ? `From ${teacherName(l.teacher)}` : undefined}>
                <ul className="list">
                  {perLink[i].map((f) => (
                    <li key={f.id} className="spread" style={{ alignItems: 'flex-start' }}>
                      <span style={{ minWidth: 0 }}>
                        <strong>{f.title}</strong> <Badge tone={FILE_TYPES[f.mime] === 'Audio' ? 'purple' : 'sky'}>{FILE_TYPES[f.mime] ?? 'File'}</Badge>
                        <div className="small muted">
                          {f.everyone ? '' : `For ${f.student_ids.map((id) => names(l).get(id)).filter(Boolean).join(' and ')} · `}
                          {sizeText(f.size_bytes)} · {fmtDate(f.created_at.slice(0, 10), 'd MMM yyyy')}
                        </div>
                        {f.notes && <div className="small" style={{ marginTop: 2 }}>{f.notes}</div>}
                      </span>
                      <a className="btn btn-sm" href={`/family/music/${f.id}`}>
                        Download
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            ),
          )}
        </div>
      )}
    </>
  )
}
