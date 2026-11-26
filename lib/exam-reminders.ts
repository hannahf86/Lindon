// =============================================================================
// lib/exam-reminders.ts — "your exam is coming up" emails to families
//
// sendDueExamReminders() runs in the hourly cron. For each teacher with the
// exams feature AND exam reminders switched on (Settings → Communication), it
// emails the pupil's parents (or the adult pupil) once, when the exam is
// teacher.exam_reminder_days away or closer, from 9am in the teacher's own
// timezone. exams.exam_reminder_sent_at is only set when an email actually
// went out, so a failed send is retried next hour.
// Withdrawn and already-taken exams are skipped.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { addDaysISO, fmtDate, fmtTz, todayISO } from './dates'
import { fullName, hhmm } from './format'
import { has } from './features'
import { detailTable, esc, layout, paragraphs } from './email-templates'
import { sendEmail, signature, studioName } from './email'
import { recipientsFor } from './recipients'
import type { Teacher } from './database.types'

export type ExamReminderSummary = { teachers: number; sent: number; noAddress: number; failed: number }

export async function sendDueExamReminders(now = new Date()): Promise<ExamReminderSummary> {
  const summary: ExamReminderSummary = { teachers: 0, sent: 0, noAddress: 0, failed: 0 }
  const teachers = must(await db().from('teachers').select('*').eq('exam_reminders_enabled', true)) as Teacher[]

  for (const teacher of teachers.filter((t) => has(t, 'exams'))) {
    // Only from 9am local time, so families aren't emailed overnight
    if (Number(fmtTz(now.toISOString(), teacher.timezone, 'H')) < 9) continue
    summary.teachers++
    const today = todayISO(teacher.timezone)
    const exams = must(
      await db()
        .from('exams')
        .select('id, student_id, board, grade, instrument, exam_date, exam_time, venue, students(first_name, last_name)')
        .eq('teacher_id', teacher.id)
        .in('status', ['planned', 'entered'])
        .is('exam_reminder_sent_at', null)
        .gte('exam_date', today)
        .lte('exam_date', addDaysISO(today, teacher.exam_reminder_days)),
    )

    for (const exam of exams) {
      const { recipients } = await recipientsFor(teacher.id, [exam.student_id])
      if (recipients.length === 0) {
        summary.noAddress++
        continue
      }
      const who = fullName(exam.students) || 'Your exam'
      const what = [exam.board, exam.instrument, exam.grade].filter(Boolean).join(' · ') || 'Exam'
      const when = `${fmtDate(exam.exam_date, 'EEEE d MMMM yyyy')}${exam.exam_time ? ` at ${hhmm(exam.exam_time)}` : ''}`
      const studio = studioName(teacher)
      const sign = signature(teacher)
      const intro = `Just a reminder that ${who}’s exam is coming up. Good luck — a little practice every day between now and then makes a big difference!`
      const result = await sendEmail({
        teacher,
        to: recipients.map((r) => r.email),
        kind: 'reminder',
        email: {
          subject: `Exam reminder: ${who}, ${fmtDate(exam.exam_date, 'd MMMM')}`,
          text: `${intro}\n\n${what}\n${when}${exam.venue ? `\n${exam.venue}` : ''}\n\n${sign}`,
          html: layout({
            studio,
            heading: 'Exam coming up',
            bodyHtml:
              `<p style="margin:0 0 16px;line-height:1.55">${esc(intro)}</p>` +
              detailTable([['Exam', what], ['When', when], ...(exam.venue ? ([['Where', exam.venue]] as [string, string][]) : [])]) +
              paragraphs(sign),
          }),
        },
      })
      if (result.sent === 0) {
        summary.failed++
        continue
      }
      must(await db().from('exams').update({ exam_reminder_sent_at: new Date().toISOString() }).eq('id', exam.id).eq('teacher_id', teacher.id).select('id'))
      summary.sent++
    }
  }
  return summary
}
