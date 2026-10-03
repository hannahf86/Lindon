// =============================================================================
// app/family/_lib/family-data.ts — small server helpers for the family area
//
// · conversationForLink() — the existing conversation between a family link
//   and its teacher (never creates one — viewing a page mustn't start a thread)
// · familyUnread()        — total unread messages across all their teachers
// · studioLine()          — "Jane Smith · Harrogate Piano Studio"
// · pupilNames()          — id → first name lookup for a link's pupils
// · lessonBadge()         — family-friendly wording for lesson statuses
//
// Access control lives in lib/family.ts — every helper here takes a link that
// came from requireFamily(), and scopes its query by that link's teacher.
// =============================================================================
import 'server-only'
import { cache } from 'react'
import { db } from '@/lib/db'
import type { FamilyContext, FamilyLink, FamilyTeacher } from '@/lib/family'
import type { Conversation } from '@/lib/database.types'

// ---- Conversations -----------------------------------------------------------------
/** Cached per request, keyed by plain strings so layout + page share one lookup. */
const findConversation = cache(async (teacherId: string, col: 'guardian_id' | 'student_id', contactId: string) => {
  const { data, error } = await db().from('conversations').select('*').eq('teacher_id', teacherId).eq(col, contactId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
})

/** The conversation for this link, or null if nobody has written yet. */
export async function conversationForLink(link: FamilyLink): Promise<Conversation | null> {
  if (link.kind === 'guardian' && link.guardianId) return findConversation(link.teacher.id, 'guardian_id', link.guardianId)
  if (link.kind === 'student' && link.studentId) return findConversation(link.teacher.id, 'student_id', link.studentId)
  return null
}

/** Unread messages from all their teachers (nav badge + home alert). */
export async function familyUnread(ctx: FamilyContext): Promise<number> {
  const convs = await Promise.all(ctx.links.map(conversationForLink))
  return convs.reduce((n, c) => n + (c?.family_unread ?? 0), 0)
}

// ---- Display helpers -----------------------------------------------------------------
/** Teacher name with their studio name alongside, when they have both. */
export function studioLine(t: FamilyTeacher): string {
  const parts = [t.display_name, t.business_name].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Your teacher'
}

/** id → first name, for labelling rows when a family has more than one pupil. */
export function pupilNames(link: FamilyLink): Map<string, string> {
  return new Map(link.pupils.map((p) => [p.id, p.first_name]))
}

/** Lesson statuses in plain words for parents. */
export function lessonBadge(status: string): { text: string; tone: 'sky' | 'teal' | 'coral' | 'butter' | 'plain' } {
  switch (status) {
    case 'scheduled':
      return { text: 'Booked', tone: 'sky' }
    case 'present':
      return { text: 'Done', tone: 'teal' }
    case 'notice_given':
      return { text: 'Cancelled — credit added', tone: 'coral' }
    case 'teacher_cancelled':
      return { text: 'Cancelled by teacher — credit added', tone: 'coral' }
    case 'absent':
      return { text: 'Missed', tone: 'butter' }
    default:
      return { text: status, tone: 'plain' }
  }
}
