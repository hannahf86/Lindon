// =============================================================================
// lib/reminders.ts — lesson reminder emails
//
// sendDueReminders()   — the hourly cron job. For every teacher with reminders
//                        switched on, emails parents/students about scheduled
//                        lessons starting within that teacher's reminder window
//                        (teacher.reminder_hours_before) that haven't had one yet.
// sendLessonReminder() — one lesson, right now (the "Send reminder now" button).
//
// This runs as a system job (no signed-in teacher), so it uses db() directly —
// but every lesson query is still scoped by that teacher's id.
// reminder_sent_at is only set when at least one email actually went out, so
// a failed send is retried on the next run.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { duration, fullName } from './format'
import { lessonReminderEmail } from './email-templates'
import { sendEmail, signature, studioName } from './email'
import { recipientsFor } from './recipients'
import { lessonWhen } from './lessons'
import type { Lesson, Teacher } from './database.types'

export type ReminderOutcome = { ok: boolean; sentTo: string[]; error?: string; noAddress?: boolean }

export type ReminderRunSummary = {
  teachers: number // teachers with reminders switched on
  due: number // lessons in a reminder window
  sent: number // lessons reminded successfully
  noAddress: number // lessons skipped: nobody to email
  failed: number // lessons where sending failed (retried next run)
  errors: string[]
}

type LessonForReminder = Pick<Lesson, 'id' | 'student_id' | 'starts_at' | 'duration_minutes' | 'instrument' | 'location'> & {
  students: { first_name: string; last_name: string } | null
}

// ---- Send one reminder (shared by the cron job and the button) ---------------------
async function remind(teacher: Teacher, lesson: LessonForReminder): Promise<ReminderOutcome> {
  const { recipients } = await recipientsFor(teacher.id, [lesson.student_id])
  if (recipients.length === 0) {
    return { ok: false, sentTo: [], noAddress: true, error: 'No email address to send to — add a parent, or the student’s own email if they’re 18 or over.' }
  }

  const email = lessonReminderEmail({
    studio: studioName(teacher),
    studentName: fullName(lesson.students) || 'your lesson',
    when: lessonWhen(lesson.starts_at, teacher.timezone),
    duration: duration(lesson.duration_minutes),
    instrument: lesson.instrument,
    location: lesson.location,
    extraMessage: teacher.reminder_message,
    signature: signature(teacher),
  })
  const result = await sendEmail({
    teacher,
    to: recipients.map((r) => r.email),
    email,
    kind: 'reminder',
    lessonId: lesson.id,
  })
  if (result.sent === 0) return { ok: false, sentTo: [], error: result.error ?? 'The email could not be sent.' }

  // Only mark as reminded once something actually went out
  must(
    await db()
      .from('lessons')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', lesson.id)
      .eq('teacher_id', teacher.id)
      .select('id'),
  )
  return { ok: true, sentTo: recipients.map((r) => r.name || r.email), error: result.error }
}

// ---- "Send reminder now" for a single lesson ---------------------------------------
/** Send a reminder for one lesson straight away (ignores the reminder window). */
export async function sendLessonReminder(teacher: Teacher, lessonId: string): Promise<ReminderOutcome> {
  const { data: lesson } = await db()
    .from('lessons')
    .select('id, student_id, starts_at, duration_minutes, instrument, location, students(first_name, last_name)')
    .eq('id', lessonId)
    .eq('teacher_id', teacher.id)
    .maybeSingle()
  if (!lesson) return { ok: false, sentTo: [], error: 'Lesson not found.' }
  return remind(teacher, lesson)
}

// ---- The hourly cron job -------------------------------------------------------------
export async function sendDueReminders(now = new Date()): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = { teachers: 0, due: 0, sent: 0, noAddress: 0, failed: 0, errors: [] }
  const teachers = must(await db().from('teachers').select('*').eq('reminders_enabled', true))
  summary.teachers = teachers.length

  for (const teacher of teachers) {
    try {
      const windowEnd = new Date(now.getTime() + teacher.reminder_hours_before * 60 * 60 * 1000)
      const lessons = must(
        await db()
          .from('lessons')
          .select('id, student_id, starts_at, duration_minutes, instrument, location, students(first_name, last_name, status, reminders_enabled)')
          .eq('teacher_id', teacher.id)
          .eq('status', 'scheduled')
          .is('reminder_sent_at', null)
          .gt('starts_at', now.toISOString())
          .lte('starts_at', windowEnd.toISOString())
          .order('starts_at'),
      )
      // Only active students who haven't had reminders switched off
      const due = lessons.filter((l) => l.students && l.students.status === 'active' && l.students.reminders_enabled)
      summary.due += due.length

      for (const lesson of due) {
        const outcome = await remind(teacher, lesson)
        if (outcome.ok) summary.sent++
        else if (outcome.noAddress) summary.noAddress++
        else {
          summary.failed++
          if (outcome.error) summary.errors.push(outcome.error)
        }
      }
    } catch (e) {
      // One teacher's problem shouldn't stop everyone else's reminders
      summary.errors.push((e as Error).message)
    }
  }
  return summary
}
