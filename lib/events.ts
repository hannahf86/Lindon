// =============================================================================
// lib/events.ts — calendar event kinds and wording (pure; client-safe)
// =============================================================================
import type { EventKind } from './database.types'

export const EVENT_KINDS: { value: EventKind; label: string }[] = [
  { value: 'concert', label: 'Concert' },
  { value: 'exam_day', label: 'Exam day' },
  { value: 'group_lesson', label: 'Group lesson' },
  { value: 'mock_exam', label: 'Mock exam' },
  { value: 'other', label: 'Other' },
]

export const EVENT_KIND_KEYS = EVENT_KINDS.map((k) => k.value)

export function eventKindLabel(kind: string): string {
  return EVENT_KINDS.find((k) => k.value === kind)?.label ?? 'Event'
}

/** "All day" or "18:00–20:00" / "From 18:00". */
export function eventTimeLabel(e: { starts: string | null; ends: string | null }): string {
  if (!e.starts) return 'All day'
  const s = e.starts.slice(0, 5)
  return e.ends ? `${s}–${e.ends.slice(0, 5)}` : `From ${s}`
}
