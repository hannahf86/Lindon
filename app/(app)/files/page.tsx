// =============================================================================
// files/page.tsx — Music & files: share sheet music, images and backing
// tracks with families (feature: sheets)
//
// Left: "Share a file" (uploader.tsx). Right: everything shared so far —
// title, who it's for, type and size, when — with Download and Remove.
// Families see the files meant for their children under "Music".
// =============================================================================
import type { Metadata } from 'next'
import { requireFeature } from '@/lib/require-feature'
import { studentOptions } from '@/lib/queries'
import { db, must } from '@/lib/db'
import { fmtDate } from '@/lib/dates'
import { fullName } from '@/lib/format'
import { FILE_TYPES, sizeText, teacherFiles } from '@/lib/shared-files'
import { has } from '@/lib/features'
import { ConfirmButton } from '@/components/forms'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { FileUploader } from './uploader'
import { deleteFile } from './actions'

export const metadata: Metadata = { title: 'Music & files' }

export default async function FilesPage() {
  const teacher = await requireFeature('sheets')
  const [files, students, pupils] = await Promise.all([
    teacherFiles(teacher.id),
    studentOptions(teacher.id),
    db().from('students').select('id, first_name, last_name').eq('teacher_id', teacher.id).then(must),
  ])
  const names = new Map(pupils.map((p) => [p.id, fullName(p)]))

  return (
    <>
      <PageHeader title="Music & files" subtitle="Share sheet music, scans and backing tracks with families — they download them from their Lindon login." />
      {!has(teacher, 'family_logins') && (
        <div className="alert alert-info" style={{ marginBottom: 20 }}>
          Families need a login to see these — switch on Family logins under Settings → Features.
        </div>
      )}

      <div className="split split-form-first">
        {/* ---- Share a file ---- */}
        <Card title="Share a file">
          <FileUploader students={students} />
        </Card>

        {/* ---- Shared so far ---- */}
        <Card title={`Shared (${files.length})`}>
          {files.length === 0 ? (
            <EmptyState title="Nothing shared yet">Upload a PDF of a piece, a scale sheet or a backing track and choose who it’s for.</EmptyState>
          ) : (
            <ul className="list">
              {files.map((f) => (
                <li key={f.id} className="spread" style={{ alignItems: 'flex-start' }}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{f.title}</strong>{' '}
                    <Badge tone={FILE_TYPES[f.mime] === 'Audio' ? 'purple' : FILE_TYPES[f.mime] === 'PDF' ? 'sky' : 'butter'}>{FILE_TYPES[f.mime] ?? 'File'}</Badge>
                    <div className="small muted">
                      {f.everyone ? 'Everyone' : f.student_ids.map((id) => names.get(id) ?? 'A past pupil').join(', ')} · {sizeText(f.size_bytes)} · {fmtDate(f.created_at.slice(0, 10), 'd MMM yyyy')}
                    </div>
                    {f.notes && <div className="small" style={{ marginTop: 2 }}>{f.notes}</div>}
                  </span>
                  <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <a className="btn btn-secondary btn-sm" href={`/files/${f.id}/download`}>
                      Download
                    </a>
                    <ConfirmButton action={deleteFile.bind(null, f.id)} confirm={`Remove “${f.title}”? Families won’t be able to download it any more.`} className="btn btn-ghost btn-sm">
                      Remove
                    </ConfirmButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
