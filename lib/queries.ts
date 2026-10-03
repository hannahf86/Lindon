// =============================================================================
// lib/queries.ts — small shared lookups used by several pages
// (picker options, the teacher's previously-typed values for quick chips).
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { fullName, splitList } from './format'
import type { PickerOption } from '@/components/pickers'

/** Students as Picker options (active first, then paused/left). */
export async function studentOptions(teacherId: string, opts: { includeLeft?: boolean } = {}): Promise<PickerOption[]> {
  let q = db()
    .from('students')
    .select('id, first_name, last_name, instruments, status')
    .eq('teacher_id', teacherId)
    .order('first_name')
  if (!opts.includeLeft) q = q.neq('status', 'left')
  const rows = must(await q)
  const rank = { active: 0, paused: 1, left: 2 } as const
  return rows
    .sort((a, b) => rank[a.status] - rank[b.status])
    .map((s) => ({
      id: s.id,
      label: fullName(s),
      sub: [s.instruments.join(', '), s.status !== 'active' ? s.status : ''].filter(Boolean).join(' · ') || undefined,
    }))
}

/** Guardians as Picker options. */
export async function guardianOptions(teacherId: string): Promise<PickerOption[]> {
  const rows = must(await db().from('guardians').select('id, first_name, last_name, email').eq('teacher_id', teacherId).order('first_name'))
  return rows.map((g) => ({ id: g.id, label: fullName(g), sub: g.email || undefined }))
}

/** Every instrument the teacher has typed anywhere — offered as quick-add chips. */
export async function instrumentSuggestions(teacherId: string): Promise<string[]> {
  const [students, slots] = await Promise.all([
    db().from('students').select('instruments').eq('teacher_id', teacherId),
    db().from('time_slots').select('instrument').eq('teacher_id', teacherId),
  ])
  const all = [...(students.data ?? []).flatMap((s) => s.instruments), ...(slots.data ?? []).map((s) => s.instrument)]
  return splitList(all.join(','))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 24)
}

/** Distinct non-empty values of a text column (e.g. exam boards, item kinds). */
export async function distinctValues(
  teacherId: string,
  table: 'exams' | 'library_items' | 'time_slots' | 'lessons' | 'products',
  column: string,
): Promise<string[]> {
  const { data } = await db().from(table).select(column).eq('teacher_id', teacherId).limit(500)
  const values = ((data ?? []) as unknown as Record<string, string>[]).map((r) => r[column])
  return splitList(values.filter(Boolean).join('\n')).sort((a, b) => a.localeCompare(b)).slice(0, 24)
}
