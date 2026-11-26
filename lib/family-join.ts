// =============================================================================
// lib/family-join.ts — the family welcome page (/join/<token>)
//
// loadInvite(token) — the live invitation behind a link, with what the
//   welcome page shows: the teacher, the person invited (parent or adult
//   pupil), the pupils they'll see, and each pupil's regular lessons (day,
//   time, length, price, how often, location). null if the link is unknown,
//   revoked, or the teacher has family logins switched off.
// newInviteToken() — the random part of the link.
// Runs without a signed-in user (the token in the emailed link is the key),
// so every query is scoped to the invitation's own teacher and people.
// =============================================================================
import 'server-only'
import { randomBytes } from 'node:crypto'
import { db } from './db'
import { isMinor } from './format'
import { has } from './features'
import { todayISO } from './dates'
import type { Teacher } from './database.types'

export const newInviteToken = () => randomBytes(24).toString('base64url')

export type JoinLesson = { id: string; day_of_week: number; start_time: string; duration_minutes: number; price: number; repeat_weeks: number; location: string; instrument: string }
export type JoinPupil = { id: string; first_name: string; last_name: string; instruments: string[]; level: string; lessons: JoinLesson[] }
export type JoinInvite = {
  accessId: string
  email: string
  onboarded: boolean
  teacher: Teacher
  kind: 'guardian' | 'student'
  person: { id: string; first_name: string; last_name: string; phone: string }
  pupils: JoinPupil[]
}

export async function loadInvite(token: string): Promise<JoinInvite | null> {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return null
  const { data: access } = await db().from('family_access').select('*').eq('invite_token', token).is('revoked_at', null).maybeSingle()
  if (!access) return null
  const { data: teacher } = await db().from('teachers').select('*').eq('id', access.teacher_id).maybeSingle()
  if (!teacher || !has(teacher, 'family_logins')) return null

  let person: JoinInvite['person'] | null = null
  let students: { id: string; first_name: string; last_name: string; instruments: string[]; level: string; date_of_birth: string | null; is_minor: boolean; status: string }[] = []

  if (access.guardian_id) {
    const { data: g } = await db()
      .from('guardians')
      .select('id, first_name, last_name, phone, student_guardians(students(id, first_name, last_name, instruments, level, date_of_birth, is_minor, status))')
      .eq('id', access.guardian_id)
      .eq('teacher_id', teacher.id)
      .maybeSingle()
    if (!g) return null
    person = { id: g.id, first_name: g.first_name, last_name: g.last_name, phone: g.phone }
    students = g.student_guardians.map((l) => l.students).filter((s): s is NonNullable<typeof s> => !!s && isMinor(s) && s.status !== 'left')
  } else if (access.student_id) {
    const { data: s } = await db()
      .from('students')
      .select('id, first_name, last_name, phone, instruments, level, date_of_birth, is_minor, status')
      .eq('id', access.student_id)
      .eq('teacher_id', teacher.id)
      .maybeSingle()
    if (!s) return null
    person = { id: s.id, first_name: s.first_name, last_name: s.last_name, phone: s.phone }
    students = s.status !== 'left' ? [s] : []
  }
  if (!person) return null

  // Their regular lessons (bookings that haven't ended)
  const today = todayISO(teacher.timezone)
  const ids = students.map((s) => s.id)
  const { data: slots } = ids.length
    ? await db()
        .from('time_slots')
        .select('id, student_id, day_of_week, start_time, duration_minutes, price, repeat_weeks, location, instrument, ends_on')
        .eq('teacher_id', teacher.id)
        .eq('active', true)
        .in('student_id', ids)
        .order('day_of_week')
        .order('start_time')
    : { data: [] }
  const live = (slots ?? []).filter((b) => !b.ends_on || b.ends_on >= today)

  return {
    accessId: access.id,
    email: access.email,
    onboarded: !!access.onboarded_at,
    teacher,
    kind: access.guardian_id ? 'guardian' : 'student',
    person,
    pupils: students.map((s) => ({
      id: s.id,
      first_name: s.first_name,
      last_name: s.last_name,
      instruments: s.instruments,
      level: s.level,
      lessons: live.filter((b) => b.student_id === s.id).map((b) => ({ ...b, price: Number(b.price) })),
    })),
  }
}
