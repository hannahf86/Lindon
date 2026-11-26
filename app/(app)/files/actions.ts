'use server'
// =============================================================================
// files/actions.ts — the teacher's music & files
//
// prepareUpload()  — checks the file (type, size), then makes a one-off
//                    signed upload link so the BROWSER sends the file straight
//                    to storage (no server size limit in the way)
// saveFile()       — after the upload: records title, notes and who it's for
// deleteFile()     — removes the record and the stored file
// Everything is scoped to the signed-in teacher; pupil ids are re-checked.
// =============================================================================
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'node:crypto'
import { db, must } from '@/lib/db'
import { requireFeature } from '@/lib/require-feature'
import { FormError, handle, type ActionState } from '@/lib/forms'
import { FILE_TYPES, MAX_FILE_BYTES, SHEETS_BUCKET } from '@/lib/shared-files'

export type PreparedUpload = { ok: true; signedUrl: string; path: string } | { ok: false; error: string }

export async function prepareUpload(fileName: string, mime: string, size: number): Promise<PreparedUpload> {
  try {
    const teacher = await requireFeature('sheets')
    if (!FILE_TYPES[mime]) return { ok: false, error: 'That type of file can’t be shared — use a PDF, PNG/JPG image, or MP3/M4A/WAV audio.' }
    if (size > MAX_FILE_BYTES) return { ok: false, error: 'That file is over 25 MB — please use a smaller one.' }
    const safe = fileName.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'file'
    const path = `${teacher.id}/${randomBytes(9).toString('base64url')}/${safe}`
    const { data, error } = await db().storage.from(SHEETS_BUCKET).createSignedUploadUrl(path)
    if (error || !data) return { ok: false, error: `The upload couldn’t start (${error?.message ?? 'unknown problem'}).` }
    return { ok: true, signedUrl: data.signedUrl, path }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function saveFile(input: {
  path: string
  fileName: string
  mime: string
  size: number
  title: string
  notes: string
  everyone: boolean
  studentIds: string[]
}): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireFeature('sheets')
    if (!input.path.startsWith(`${teacher.id}/`)) throw new FormError('That upload couldn’t be found.')
    const title = input.title.trim() || input.fileName
    let studentIds: string[] = []
    if (!input.everyone) {
      const ids = input.studentIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      if (!ids.length) throw new FormError('Choose at least one pupil, or share it with everyone.')
      // Only this teacher's pupils
      const rows = must(await db().from('students').select('id').eq('teacher_id', teacher.id).in('id', ids))
      studentIds = rows.map((r) => r.id)
    }
    must(
      await db()
        .from('shared_files')
        .insert({
          teacher_id: teacher.id,
          title: title.slice(0, 200),
          notes: input.notes.trim().slice(0, 1000),
          path: input.path,
          file_name: input.fileName.slice(0, 200),
          mime: input.mime,
          size_bytes: Math.max(0, Math.round(input.size)),
          everyone: input.everyone,
          student_ids: studentIds,
        })
        .select('id'),
    )
    return { ok: `“${title}” shared.` }
  })
  if (result?.ok) {
    revalidatePath('/files')
    revalidatePath('/family', 'layout')
  }
  return result
}

export async function deleteFile(id: string): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireFeature('sheets')
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new FormError('That file couldn’t be found.')
    const rows = must(await db().from('shared_files').delete().eq('id', id).eq('teacher_id', teacher.id).select('path'))
    if (rows[0]) await db().storage.from(SHEETS_BUCKET).remove([rows[0].path])
    return { ok: 'File removed.' }
  })
  if (result?.ok) {
    revalidatePath('/files')
    revalidatePath('/family', 'layout')
  }
  return result
}
