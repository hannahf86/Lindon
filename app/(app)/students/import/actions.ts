'use server'
// =============================================================================
// students/import/actions.ts — check a CSV of students, then add them
//
// checkImport(text, keys?)  read the file and say what each column will be
//                    used for, and row by row what will happen: added,
//                    skipped because they're already on Lindon, or left out
//                    (no name). keys = the teacher's column choices, if any
// runImport(text, keys?)  the same checks, then add every pupil in one go:
//                    students, then parents (brothers and sisters share one
//                    parent by email, including parents already on file),
//                    then the links between them
// The file text is sent each time (it's small) so nothing is kept between
// the two steps.
// =============================================================================
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { matchTargets, readImport, type ImportColumn, type ImportParent, type ImportRow, type TargetGroup } from '@/lib/student-import'

const MAX_TEXT = 900_000 // stays under the 1 MB server action limit

export type CheckedRow = { line: number; name: string; parent: string; outcome: 'add' | 'duplicate' | 'problem'; note: string; warnings: string[] }
export type ImportCheck =
  | { ok: false; error: string }
  | { ok: true; rows: CheckedRow[]; adding: number; unknownHeadings: string[]; columns: ImportColumn[]; targets: TargetGroup[]; problem: string | null }

type Ready = { rows: ImportRow[]; checked: CheckedRow[]; unknownHeadings: string[]; columns: ImportColumn[]; parentCount: number; problem: string | null }

/** Read + check the file against the students already on Lindon. */
async function prepare(teacherId: string, text: string, keys?: string[]): Promise<Ready | { error: string }> {
  if (text.length > MAX_TEXT) return { error: 'That file is too big — split it into smaller files of a few hundred students.' }
  const result = readImport(text, keys)
  // No columns at all = the file itself is the problem; otherwise show the
  // matching screen so the teacher can fix it (e.g. choose the name column)
  if (result.error && !result.columns.length) return { error: result.error }
  if (result.error) return { rows: [], checked: [], unknownHeadings: [], columns: result.columns, parentCount: result.parentCount, problem: result.error }

  const existing = must(await db().from('students').select('first_name, last_name').eq('teacher_id', teacherId))
  const key = (f: string, l: string) => `${f.trim().toLowerCase()}|${l.trim().toLowerCase()}`
  const seen = new Set(existing.map((s) => key(s.first_name, s.last_name)))

  const rows: ImportRow[] = []
  const checked = result.rows.map((r): CheckedRow => {
    const parent = r.parents.map((p) => [p.first_name, p.last_name].filter(Boolean).join(' ')).join(', ')
    if (r.problem || !r.student) return { line: r.line, name: r.name, parent, outcome: 'problem', note: r.problem ?? 'Can’t be read.', warnings: [] }
    const k = key(r.student.first_name, r.student.last_name)
    if (seen.has(k)) return { line: r.line, name: r.name, parent, outcome: 'duplicate', note: 'Already on Lindon (or twice in this file) — skipped.', warnings: [] }
    seen.add(k)
    rows.push(r)
    const note = [`${r.student.is_minor ? 'Child' : 'Adult'} (${r.basis})`, r.student.instruments.join(', '), r.student.status === 'active' ? '' : r.student.status === 'left' ? 'Past' : 'Paused']
      .filter(Boolean)
      .join(' · ')
    return { line: r.line, name: r.name, parent, outcome: 'add', note, warnings: r.warnings }
  })
  return { rows, checked, unknownHeadings: result.unknownHeadings, columns: result.columns, parentCount: result.parentCount, problem: null }
}

export async function checkImport(text: string, keys?: string[]): Promise<ImportCheck> {
  try {
    const teacher = await requireTeacher()
    const ready = await prepare(teacher.id, text, keys)
    if ('error' in ready) return { ok: false, error: ready.error }
    return {
      ok: true,
      rows: ready.checked,
      adding: ready.rows.length,
      unknownHeadings: ready.unknownHeadings,
      columns: ready.columns,
      targets: matchTargets(ready.parentCount),
      problem: ready.problem,
    }
  } catch (e) {
    return { ok: false, error: `The file couldn’t be checked (${(e as Error).message}).` }
  }
}

export async function runImport(text: string, keys?: string[]): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  try {
    const teacher = await requireTeacher()
    const ready = await prepare(teacher.id, text, keys)
    if ('error' in ready) return { ok: false, error: ready.error }
    if (ready.problem) return { ok: false, error: ready.problem }
    if (ready.rows.length === 0) return { ok: false, error: 'There’s nobody new to add from that file.' }

    // 1. Students (returned in the order sent)
    const students = must(
      await db()
        .from('students')
        .insert(ready.rows.map((r) => ({ ...r.student!, teacher_id: teacher.id, reminders_enabled: true })))
        .select('id'),
    )

    // 2. Parents: one per email (reusing any already on file); no email → one per name + phone
    const parentKey = (p: ImportParent) => (p.email ? `e:${p.email}` : `n:${p.first_name.toLowerCase()}|${p.last_name.toLowerCase()}|${p.phone}`)
    const parents = new Map<string, ImportParent>()
    for (const r of ready.rows) for (const p of r.parents) if (!parents.has(parentKey(p))) parents.set(parentKey(p), p)

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
          .insert(toAdd.map(([, p]) => ({ teacher_id: teacher.id, first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone, address: p.address, notes: p.notes })))
          .select('id'),
      )
      toAdd.forEach(([k], i) => ids.set(k, added[i].id))
    }

    // 3. Links
    // (the first parent is the main contact; the same parent listed twice for one pupil is linked once)
    const links = ready.rows.flatMap((r, i) => {
      const done = new Set<string>()
      return r.parents.flatMap((p, j) => {
        const guardian_id = ids.get(parentKey(p))!
        if (done.has(guardian_id)) return []
        done.add(guardian_id)
        return [{ teacher_id: teacher.id, student_id: students[i].id, guardian_id, relationship: p.relationship, is_primary: j === 0, receives_emails: true }]
      })
    })
    if (links.length) must(await db().from('student_guardians').insert(links).select('student_id'))

    revalidatePath('/students')
    revalidatePath('/contacts')
    revalidatePath('/')
    return { ok: true, added: students.length }
  } catch (e) {
    return { ok: false, error: `The import stopped part-way (${(e as Error).message}). Check your students list before trying again.` }
  }
}
