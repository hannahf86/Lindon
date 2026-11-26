// =============================================================================
// lib/shared-files.ts — music & files for families (table shared_files,
// private Storage bucket "sheets")
//
// FILE_TYPES / MAX_FILE_BYTES — what can be uploaded (PDF, PNG/JPG, audio)
// filesForPupils()  — the files a family may see: everyone-files plus those
//                     shared with any of their pupils
// signedDownload()  — a short-lived link to the file (60 s), handed out only
//                     after the caller has checked access
// sizeText()        — "2.4 MB"
// =============================================================================
import 'server-only'
import { db, must } from './db'

export const SHEETS_BUCKET = 'sheets'
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const FILE_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/png': 'Image',
  'image/jpeg': 'Image',
  'audio/mpeg': 'Audio',
  'audio/mp4': 'Audio',
  'audio/x-m4a': 'Audio',
  'audio/wav': 'Audio',
  'audio/x-wav': 'Audio',
}

export type SharedFile = {
  id: string
  title: string
  notes: string
  file_name: string
  mime: string
  size_bytes: number
  everyone: boolean
  student_ids: string[]
  created_at: string
}

const COLS = 'id, title, notes, file_name, mime, size_bytes, everyone, student_ids, created_at'

/** Files a family can see from one teacher: for everyone, or for one of their pupils. */
export async function filesForPupils(teacherId: string, studentIds: string[]): Promise<SharedFile[]> {
  const rows = must(await db().from('shared_files').select(COLS).eq('teacher_id', teacherId).order('created_at', { ascending: false }))
  return rows.filter((f) => f.everyone || f.student_ids.some((id) => studentIds.includes(id)))
}

/** All of a teacher's files (their own page). */
export async function teacherFiles(teacherId: string): Promise<SharedFile[]> {
  return must(await db().from('shared_files').select(COLS).eq('teacher_id', teacherId).order('created_at', { ascending: false }))
}

/** A 60-second download link (forces "save as" with the original name). */
export async function signedDownload(path: string, fileName: string): Promise<string | null> {
  const { data } = await db().storage.from(SHEETS_BUCKET).createSignedUrl(path, 60, { download: fileName })
  return data?.signedUrl ?? null
}

export function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
