// =============================================================================
// lib/event-sharing.ts — events shown to families, and who's coming
//
// eventPupils()        — the pupils an event is for (everyone = all active)
// familyEvents()       — upcoming shared events for a family's pupils, with
//                        each pupil's answer so far
// eventReplies()       — the teacher's view: coming / can't / no reply yet
// notifyEventFamilies()— tells the families (in-app message + email alert,
//                        when messages are on) that there's an event to answer
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { fmtDate } from './dates'
import { fullName, isMinor } from './format'
import { has } from './features'
import { conversationFor, postMessage, type ConversationTarget } from './messages'
import { studioName } from './email'
import { eventTimeLabel } from './events'
import type { Teacher } from './database.types'

type EventShare = { id: string; teacher_id: string; everyone: boolean; student_ids: string[] }

/** Pupils an event is for: everyone = every active pupil, otherwise the chosen ones (still active). */
export async function eventPupils(e: EventShare) {
  const q = db().from('students').select('id, first_name, last_name, date_of_birth, is_minor, student_guardians(guardian_id)').eq('teacher_id', e.teacher_id).eq('status', 'active')
  const rows = must(await (e.everyone ? q : q.in('id', e.student_ids.length ? e.student_ids : ['00000000-0000-0000-0000-000000000000'])))
  return rows
}

export type FamilyEvent = {
  id: string
  title: string
  kind: string
  event_date: string
  starts: string | null
  ends: string | null
  location: string
  notes: string
  pupils: { id: string; first_name: string; response: 'yes' | 'no' | null; note: string }[]
}

/** Upcoming shared events for these pupils, with each pupil's answer. */
export async function familyEvents(teacherId: string, pupils: { id: string; first_name: string }[], fromDate: string): Promise<FamilyEvent[]> {
  if (!pupils.length) return []
  const ids = pupils.map((p) => p.id)
  const events = must(
    await db()
      .from('events')
      .select('id, title, kind, event_date, starts, ends, location, notes, everyone, student_ids')
      .eq('teacher_id', teacherId)
      .eq('shared', true)
      .gte('event_date', fromDate)
      .order('event_date')
      .order('starts', { nullsFirst: true }),
  )
  const mine = events.filter((e) => e.everyone || e.student_ids.some((s) => ids.includes(s)))
  if (!mine.length) return []
  const replies = must(await db().from('event_responses').select('event_id, student_id, response, note').eq('teacher_id', teacherId).in('event_id', mine.map((e) => e.id)).in('student_id', ids))
  return mine.map((e) => ({
    id: e.id,
    title: e.title,
    kind: e.kind,
    event_date: e.event_date,
    starts: e.starts,
    ends: e.ends,
    location: e.location,
    notes: e.notes,
    pupils: pupils
      .filter((p) => e.everyone || e.student_ids.includes(p.id))
      .map((p) => {
        const r = replies.find((x) => x.event_id === e.id && x.student_id === p.id)
        return { id: p.id, first_name: p.first_name, response: (r?.response as 'yes' | 'no' | undefined) ?? null, note: r?.note ?? '' }
      }),
  }))
}

/** The teacher's view of replies for one event. */
export async function eventReplies(e: EventShare) {
  const [pupils, replies] = await Promise.all([eventPupils(e), db().from('event_responses').select('student_id, response, note, responded_at').eq('event_id', e.id).eq('teacher_id', e.teacher_id).then(must)])
  const by = new Map(replies.map((r) => [r.student_id, r]))
  const rows = pupils.map((p) => ({ id: p.id, name: fullName(p), reply: by.get(p.id) ?? null }))
  return {
    coming: rows.filter((r) => r.reply?.response === 'yes'),
    notComing: rows.filter((r) => r.reply?.response === 'no'),
    waiting: rows.filter((r) => !r.reply),
  }
}

/** Message each family the event is for (once per parent / adult pupil). */
export async function notifyEventFamilies(teacher: Teacher, e: EventShare & { title: string; event_date: string; starts: string | null; ends: string | null; location: string }): Promise<number> {
  if (!has(teacher, 'messaging')) return 0
  const pupils = await eventPupils(e)
  const targets: ConversationTarget[] = []
  const seen = new Set<string>()
  const add = (key: string, target: ConversationTarget) => {
    if (seen.has(key)) return
    seen.add(key)
    targets.push(target)
  }
  for (const p of pupils) {
    if (isMinor(p)) for (const l of p.student_guardians) add(l.guardian_id, { guardianId: l.guardian_id })
    else add(p.id, { studentId: p.id })
  }
  const when = `${fmtDate(e.event_date, 'EEEE d MMMM')}, ${eventTimeLabel(e).toLowerCase()}`
  const body = `${e.title} — ${when}${e.location ? ` at ${e.location}` : ''}.\n\nPlease let me know who can come: open Events in Lindon and tap “Coming” or “Can’t make it”.`
  for (const target of targets) {
    const conversation = await conversationFor(teacher.id, target)
    await postMessage({ teacher, conversation, sender: 'teacher', senderEmail: teacher.email, senderName: teacher.display_name || studioName(teacher), body })
  }
  return targets.length
}
