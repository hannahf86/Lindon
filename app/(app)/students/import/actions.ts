'use server'
// =============================================================================
// students/import/actions.ts — check a CSV of students, then add them
//
// checkImport(text)  read the file and say, row by row, what will happen:
//                    added, skipped because they're already on Lindon, or
//                    skipped because something needs fixing
// runImport(text)    the same checks, then add every good row in one go:
//                    students, then parents (brothers and sisters share one
//                    parent by email, including parents already on file),
//                    then the links between them
// The file text is sent each time (it's small) so nothing is kept between
// the two steps.
// =============================================================================
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { readImport, type ImportRow } from '@/lib/student-import'

const MAX_TEXT = 900_000 // stays under the 1 MB server action limit

export type CheckedRow = { line: number; name: string; parent: string; outcome: 'add' | 'duplicate' | 'problem'; note: string }
export type ImportCheck = { ok: false; error: string } | { ok: true; rows: CheckedRow[]; adding: number; unknownHeadings: string[] }

type Ready = { rows: ImportRow[]; checked: CheckedRow[]; unknownHeadings: string[] }

/** Read + check the file against the students already on Lindon. */
async function prepare(teacherId: string, text: string): Promise<Ready | { error: string }> {
  if (text.length > MAX_TEXT) return { error: 'That file is too big — split it into smaller files of a few hundred students.' }
  const result = readImport(text)
  if (result.error) return { error: result.error }

  const existing = must(await db().from('students').select('first_name, last_name').eq('teacher_id', teacherId))
  const key = (f: string, l: string) => `${f.trim().toLowerCase()}|${l.trim().toLowerCase()}`
  const seen = new Set(existing.map((s) => key(s.first_name, s.last_name)))

  const rows: ImportRow[] = []
  const checked = result.rows.map((r): CheckedRow => {
    const parent = r.parent ? [r.parent.first_name, r.parent.last_name].filter(Boolean).join(' ') : ''
    if (r.problem || !r.student) return { line: r.line, name: r.name, parent, outcome: 'problem', note: r.problem ?? 'Can’t be read.' }
    const k = key(r.student.first_name, r.student.last_name)
    if (seen.has(k)) return { line: r.line, name: r.name, parent, outcome: 'duplicate', note: 'Already on Lindon (or twice in this file) — skipped.' }
    seen.add(k)
    rows.push(r)
    const note = [r.student.is_minor ? 'Child' : 'Adult', r.student.instruments.join(', '), r.student.status === 'active' ? '' : r.student.status === 'left' ? 'Past' : 'Paused']
      .filter(Boolean)
      .join(' · ')
    return { line: r.line, name: r.name, parent, outcome: 'add', note }
  })
  return { rows, checked, unknownHeadings: result.unknownHeadings }
}

export async function checkImport(text: string): Promise<ImportCheck> {
  try {
    const teacher = await requireTeacher()
    const ready = await prepare(teacher.id, text)
    if ('error' in ready) return { ok: false, error: ready.error }
    return { ok: true, rows: ready.checked, adding: ready.rows.length, unknownHeadings: ready.unknownHeadings }
  } catch (e) {
    return { ok: false, error: `The file couldn’t be checked (${(e as Error).message}).` }
  }
}

export async function runImport(text: string): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  try {
    const teacher = await requireTeacher()
    const ready = await prepare(teacher.id, text)
    if ('error' in ready) return { ok: false, error: ready.error }
    if (ready.rows.length === 0) return { ok: false, error: 'There’s nobody new to add from that file.' }

    // 1. Students (returned in the order sent)
    const students = must(
      await db()
        .from('students')
        .insert(ready.rows.map((r) => ({ ...r.student!, teacher_id: teacher.id, reminders_enabled: true })))
        .select('id'),
    )

    // 2. Parents: one per email (reusing any already on file); no email → one per name + phone
    const parentKey = (p: NonNullable<ImportRow['parent']>) => (p.email ? `e:${p.email}` : `n:${p.first_name.toLowerCase()}|${p.last_name.toLowerCase()}|${p.phone}`)
    const parents = new Map<string, NonNullable<ImportRow['parent']>>()
    for (const r of ready.rows) if (r.parent && !parents.has(parentKey(r.parent))) parents.set(parentKey(r.parent), r.parent)

    const ids = new Map<string, string>()
    const emails = [...parents.values()].map((p) => p.email).filter(Boolean)
    if (emails.length) {
      const onFile = must(await db().from('guardians').select('id, email').eq('teacher_id', teacher.id).neq('email', ''))
      for (const g of onFile) {
        const k = `e:${g.email.toLowerCase()}`
        if (parents.has(k) && !ids.has(k)) ids.set(k, g.id)
      }
    }
    const toAdd = [...parents.entries()].filter(([k]) => !ids.has(k))
    if (toAdd.length) {
      const added = must(
        await db()
          .from('guardians')
          .insert(toAdd.map(([, p]) => ({ teacher_id: teacher.id, first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone })))
          .select('id'),
      )
      toAdd.forEach(([k], i) => ids.set(k, added[i].id))
    }

    // 3. Links
    const links = ready.rows.flatMap((r, i) =>
      r.parent
        ? [{ teacher_id: teacher.id, student_id: students[i].id, guardian_id: ids.get(parentKey(r.parent))!, relationship: r.parent.relationship, is_primary: true, receives_emails: true }]
        : [],
    )
    if (links.length) must(await db().from('student_guardians').insert(links).select('student_id'))

    revalidatePath('/students')
    revalidatePath('/contacts')
    revalidatePath('/')
    return { ok: true, added: students.length }
  } catch (e) {
    return { ok: false, error: `The import stopped part-way (${(e as Error).message}). Check your students list before trying again.` }
  }
}
