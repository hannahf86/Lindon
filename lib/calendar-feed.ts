// =============================================================================
// lib/calendar-feed.ts — the teacher's lessons and events as an iCalendar
// (.ics) feed, for subscribing from Google / Apple / Outlook calendars
//
// buildCalendarFeed() — lessons from 4 weeks ago to 6 months ahead, plus
//   events, as VEVENTs. Cancelled lessons (notice given / I cancelled) are
//   sent as STATUS:CANCELLED so calendars show them struck out or drop them.
//   Lesson times are UTC; all-day events use DATE values.
// calendarFeedUrl() / newCalendarToken() — the private link.
// Calendars refresh subscribed feeds on their own schedule (Google: every few
// hours), so changes show up after a delay.
// =============================================================================
import 'server-only'
import { randomBytes } from 'node:crypto'
import { db, must } from './db'
import { addDaysISO, todayISO, zonedToUtc } from './dates'
import { fullName } from './format'
import { appUrl } from './app-url'
import { eventKindLabel } from './events'
import type { Teacher } from './database.types'

export const newCalendarToken = () => randomBytes(24).toString('base64url')
export const calendarFeedUrl = (token: string) => appUrl(`/api/calendar/${token}`)

// ---- iCalendar text helpers ----
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const utcStamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const dateValue = (d: string) => d.replace(/-/g, '')
/** Lines longer than 75 octets are folded onto continuation lines (RFC 5545). */
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut--
    out.push(rest.slice(0, cut))
    rest = ' ' + rest.slice(cut)
  }
  out.push(rest)
  return out.join('\r\n')
}

export async function buildCalendarFeed(teacher: Teacher): Promise<string> {
  const today = todayISO(teacher.timezone)
  const from = zonedToUtc(addDaysISO(today, -28), '00:00', teacher.timezone)
  const to = zonedToUtc(addDaysISO(today, 183), '00:00', teacher.timezone)
  const [lessons, events] = await Promise.all([
    must(
      await db()
        .from('lessons')
        .select('id, starts_at, duration_minutes, status, instrument, location, updated_at, students(first_name, last_name)')
        .eq('teacher_id', teacher.id)
        .gte('starts_at', from)
        .lt('starts_at', to)
        .order('starts_at'),
    ),
    must(
      await db()
        .from('events')
        .select('id, title, kind, event_date, starts, ends, location, notes, updated_at')
        .eq('teacher_id', teacher.id)
        .gte('event_date', addDaysISO(today, -28))
        .lte('event_date', addDaysISO(today, 183)),
    ),
  ])

  const now = utcStamp(new Date().toISOString())
  const studio = teacher.business_name || teacher.display_name || 'Lindon'
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lindon//Lessons//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`${studio} lessons`)}`,
    `X-WR-TIMEZONE:${teacher.timezone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  // ---- Lessons ----
  for (const l of lessons) {
    const start = new Date(l.starts_at)
    const end = new Date(start.getTime() + l.duration_minutes * 60_000)
    const who = fullName(l.students) || 'Lesson'
    const cancelled = l.status === 'notice_given' || l.status === 'teacher_cancelled'
    lines.push(
      'BEGIN:VEVENT',
      `UID:lesson-${l.id}@lindon`,
      `DTSTAMP:${now}`,
      `LAST-MODIFIED:${utcStamp(new Date(l.updated_at).toISOString())}`,
      `DTSTART:${utcStamp(start.toISOString())}`,
      `DTEND:${utcStamp(end.toISOString())}`,
      `SUMMARY:${esc(`${cancelled ? 'Cancelled: ' : ''}${who}${l.instrument ? ` · ${l.instrument}` : ''}`)}`,
      ...(l.location ? [`LOCATION:${esc(l.location)}`] : []),
      `URL:${appUrl(`/lessons/${l.id}`)}`,
      `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    )
  }

  // ---- Events (all day when there's no start time) ----
  for (const e of events) {
    const timed = !!e.starts
    const startUtc = timed ? zonedToUtc(e.event_date, e.starts!.slice(0, 5), teacher.timezone) : ''
    const endUtc = timed
      ? e.ends
        ? zonedToUtc(e.event_date, e.ends.slice(0, 5), teacher.timezone)
        : new Date(new Date(startUtc).getTime() + 60 * 60_000).toISOString()
      : ''
    lines.push(
      'BEGIN:VEVENT',
      `UID:event-${e.id}@lindon`,
      `DTSTAMP:${now}`,
      `LAST-MODIFIED:${utcStamp(new Date(e.updated_at).toISOString())}`,
      ...(timed
        ? [`DTSTART:${utcStamp(startUtc)}`, `DTEND:${utcStamp(endUtc)}`]
        : [`DTSTART;VALUE=DATE:${dateValue(e.event_date)}`, `DTEND;VALUE=DATE:${dateValue(addDaysISO(e.event_date, 1))}`]),
      `SUMMARY:${esc(`${e.title} (${eventKindLabel(e.kind)})`)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      ...(e.notes ? [`DESCRIPTION:${esc(e.notes)}`] : []),
      `URL:${appUrl(`/events/${e.id}`)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
