// =============================================================================
// app/family/_lib/family-data.ts — small server helpers for the family area
//
// · studioLine()  — "Jane Smith · Harrogate Piano Studio"
// · pupilNames()  — id → first name lookup for a link's pupils
// · lessonBadge() — family-friendly wording for lesson statuses
//
// Access control lives in lib/family.ts — every helper here takes a link that
// came from requireFamily().
// =============================================================================
import 'server-only'
import type { FamilyLink, FamilyTeacher } from '@/lib/family'

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
