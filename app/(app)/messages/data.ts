// =============================================================================
// messages/data.ts — reading conversations for the teacher's side
//
// loadInbox          conversations, newest first, with the contact's live
//                    name (or the saved name + "deleted"), linked pupils,
//                    the latest message and their family-login status.
//                    Used by the Inbox and the dashboard's "New messages".
// messageableOptions who the teacher may start a conversation with:
//                    every parent/guardian, plus pupils who are 18 or over.
//                    (Safeguarding: never a child directly.)
// =============================================================================
import 'server-only'
import { db, must } from '@/lib/db'
import { fullName, isMinor } from '@/lib/format'
import { accessStatus, type AccessStatus } from '@/lib/family-invites'
import type { PickerOption } from '@/components/pickers'
import type { FamilyAccess } from '@/lib/database.types'

export type InboxRow = {
  id: string
  name: string
  /** The contact / pupil record has since been deleted */
  deleted: boolean
  kind: 'guardian' | 'student' | null
  /** Their contact or student page */
  href: string | null
  pupils: { id: string; name: string }[]
  latest: { body: string; sender: 'teacher' | 'family'; created_at: string } | null
  lastAt: string | null
  unread: number
  access: AccessStatus
}

/** Group family_access rows by person ("g:<id>" / "s:<id>"). */
export function groupAccess(rows: FamilyAccess[]): Map<string, FamilyAccess[]> {
  const map = new Map<string, FamilyAccess[]>()
  for (const r of rows) {
    const key = r.guardian_id ? `g:${r.guardian_id}` : `s:${r.student_id}`
    map.set(key, [...(map.get(key) ?? []), r])
  }
  return map
}

// ---- Inbox --------------------------------------------------------------------------
export async function loadInbox(teacherId: string, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<InboxRow[]> {
  let q = db()
    .from('conversations')
    .select(
      `id, guardian_id, student_id, contact_name, last_message_at, teacher_unread, created_at,
       guardians(first_name, last_name, student_guardians(students(id, first_name, last_name, status))),
       students(id, first_name, last_name),
       messages(body, sender, created_at)`,
    )
    .eq('teacher_id', teacherId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    // Only the latest message of each conversation (for the preview)
    .order('created_at', { referencedTable: 'messages', ascending: false })
    .limit(1, { referencedTable: 'messages' })
  if (opts.unreadOnly) q = q.gt('teacher_unread', 0)
  if (opts.limit) q = q.limit(opts.limit)

  const [conversations, access] = await Promise.all([
    q.then(must),
    db().from('family_access').select('*').eq('teacher_id', teacherId).then(must),
  ])
  const accessBy = groupAccess(access)

  return conversations.map((c) => {
    const g = c.guardian_id ? c.guardians : null
    const s = c.student_id ? c.students : null
    const latest = c.messages[0] ?? null
    return {
      id: c.id,
      name: g ? fullName(g) : s ? fullName(s) : c.contact_name || 'Deleted contact',
      deleted: !g && !s,
      kind: g ? 'guardian' : s ? 'student' : null,
      href: g ? `/contacts/${c.guardian_id}` : s ? `/students/${c.student_id}` : null,
      pupils: g
        ? g.student_guardians
            .map((l) => l.students)
            .filter((p): p is NonNullable<typeof p> => !!p && p.status !== 'left')
            .map((p) => ({ id: p.id, name: fullName(p) }))
        : s
          ? [{ id: s.id, name: fullName(s) }]
          : [],
      latest: latest ? { body: latest.body, sender: latest.sender, created_at: latest.created_at } : null,
      lastAt: c.last_message_at,
      unread: c.teacher_unread,
      access: accessStatus(accessBy.get(g ? `g:${c.guardian_id}` : `s:${c.student_id}`) ?? []),
    }
  })
}

// ---- Who can I message? -------------------------------------------------------------------
/** Picker options: guardians (sub: their children) then adult pupils. Ids are "g:<id>" / "s:<id>". */
export async function messageableOptions(teacherId: string): Promise<PickerOption[]> {
  const [guardians, students] = await Promise.all([
    db()
      .from('guardians')
      .select('id, first_name, last_name, email, student_guardians(students(first_name, last_name, status))')
      .eq('teacher_id', teacherId)
      .order('first_name')
      .then(must),
    db()
      .from('students')
      .select('id, first_name, last_name, email, date_of_birth, is_minor, instruments')
      .eq('teacher_id', teacherId)
      .neq('status', 'left')
      .order('first_name')
      .then(must),
  ])

  const parentOptions = guardians.map((g) => {
    const kids = g.student_guardians
      .map((l) => l.students)
      .filter((s): s is NonNullable<typeof s> => !!s && s.status !== 'left')
      .map((s) => s.first_name)
    return {
      id: `g:${g.id}`,
      label: fullName(g),
      sub: [kids.length ? `Parent of ${kids.join(', ')}` : 'Contact', g.email ? '' : 'no email'].filter(Boolean).join(' · '),
    }
  })
  const adultOptions = students
    .filter((s) => !isMinor(s))
    .map((s) => ({
      id: `s:${s.id}`,
      label: fullName(s),
      sub: ['Adult pupil', s.instruments.join(', '), s.email ? '' : 'no email'].filter(Boolean).join(' · '),
    }))
  return [...parentOptions, ...adultOptions].sort((a, b) => a.label.localeCompare(b.label))
}
