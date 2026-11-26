'use server'
// =============================================================================
// family/lessons/actions.ts — a family cancelling or rescheduling a lesson
// (rules in lib/family-booking.ts)
//
// Both check the lesson is one of THEIR pupils' (canSeePupil), still booked
// and still to come. The teacher gets an email each time, with the family's
// note if they left one.
//
// Reschedule with 24h+ notice moves the lesson itself: it's taken off the
// regular booking (its date added to the booking's "weeks off", so the
// booking doesn't put it back) and given the new time — same row, so it's
// still charged exactly once. Late reschedules keep the original (charged)
// and add the new time as an extra lesson.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must } from '@/lib/db'
import { canSeePupil, requireFamily } from '@/lib/family'
import { date, handle, parseTime, str, FormError, type ActionState } from '@/lib/forms'
import { fmtTz, zonedToUtc } from '@/lib/dates'
import { fullName } from '@/lib/format'
import { isLateNotice, isStartFree } from '@/lib/family-booking'
import { sendEmail } from '@/lib/email'
import { detailTable, esc, layout, paragraphs } from '@/lib/email-templates'
import { appUrl } from '@/lib/app-url'
import type { Teacher } from '@/lib/database.types'

/** The lesson, if this family may change it. */
async function ownLesson(lessonId: string) {
  const ctx = await requireFamily()
  if (!/^[0-9a-f-]{36}$/i.test(lessonId)) throw new FormError('That lesson couldn’t be found.')
  const { data: lesson } = await db()
    .from('lessons')
    .select('*, students(first_name, last_name)')
    .eq('id', lessonId)
    .maybeSingle()
  if (!lesson || !canSeePupil(ctx, lesson.teacher_id, lesson.student_id)) throw new FormError('That lesson couldn’t be found.')
  if (lesson.status !== 'scheduled') throw new FormError('This lesson has already been changed.')
  if (new Date(lesson.starts_at) <= new Date()) throw new FormError('This lesson has already started.')
  const teacher = must(await db().from('teachers').select('*').eq('id', lesson.teacher_id).single()) as Teacher
  return { ctx, lesson, teacher }
}

/** Tell the teacher what changed. Failures are logged, never shown to the family. */
async function tellTeacher(teacher: Teacher, subject: string, heading: string, rows: [string, string][], note: string, from: string) {
  if (!teacher.email) return
  const text = `${heading}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}${note ? `\n\nTheir note: ${note}` : ''}\n\nFrom ${from} · ${appUrl('/schedule')}`
  await sendEmail({
    teacher,
    to: [teacher.email],
    kind: 'individual',
    email: {
      subject,
      text,
      html: layout({
        studio: teacher.business_name || teacher.display_name || 'Lindon',
        heading,
        bodyHtml:
          detailTable(rows) +
          (note ? `<div style="background:#EEF7F7;border-radius:14px;padding:14px 16px;margin:0 0 14px"><strong>Their note</strong>${paragraphs(note)}</div>` : '') +
          `<p style="margin:0;color:#5C6B75">From ${esc(from)}</p>`,
      }),
    },
  })
}

const addNote = (notes: string, line: string) => [notes, line].filter(Boolean).join('\n')

// ---- Cancel ----------------------------------------------------------------------------------
export async function familyCancelLesson(lessonId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const { ctx, lesson, teacher } = await ownLesson(lessonId)
    const late = isLateNotice(lesson.starts_at)
    const note = str(fd, 'note').slice(0, 1000)
    must(
      await db()
        .from('lessons')
        .update({
          // On time: notice given (credit in advance / not charged in arrears). Late: charged.
          status: late ? 'absent' : 'notice_given',
          notes: addNote(lesson.notes, `Cancelled by ${ctx.name || ctx.email}${late ? ' with less than 24 hours’ notice' : ''}${note ? `: ${note}` : '.'}`),
        })
        .eq('id', lesson.id)
        .eq('teacher_id', teacher.id)
        .select('id'),
    )
    const when = fmtTz(lesson.starts_at, teacher.timezone, "EEEE d MMMM 'at' HH:mm")
    await tellTeacher(
      teacher,
      `${fullName(lesson.students)} cancelled ${fmtTz(lesson.starts_at, teacher.timezone, 'EEE d MMM')}`,
      'Lesson cancelled',
      [
        ['Pupil', fullName(lesson.students)],
        ['Lesson', when],
        ['Notice', late ? 'Less than 24 hours — still charged' : '24 hours or more — not charged'],
      ],
      note,
      ctx.name || ctx.email,
    )
  })
  if (result?.error) return result
  revalidatePath('/family', 'layout')
  revalidatePath('/schedule', 'layout')
  revalidatePath('/')
  redirect('/family/lessons?changed=cancelled')
}

// ---- Reschedule ------------------------------------------------------------------------------
export async function familyRescheduleLesson(lessonId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const { ctx, lesson, teacher } = await ownLesson(lessonId)
    const day = date(fd, 'date')
    const raw = str(fd, 'time')
    if (!day || !raw) throw new FormError('Pick a new time first.')
    const time = parseTime(raw, 'New time')
    // Re-check: someone may have booked it in the meantime
    if (!(await isStartFree(teacher, day, time, lesson.duration_minutes, lesson.id))) throw new FormError('Sorry, that time has just gone. Please pick another.')

    const late = isLateNotice(lesson.starts_at)
    const note = str(fd, 'note').slice(0, 1000)
    const newStart = zonedToUtc(day, time, teacher.timezone)
    const by = ctx.name || ctx.email
    const oldWhen = fmtTz(lesson.starts_at, teacher.timezone, "EEEE d MMMM 'at' HH:mm")
    const newWhen = fmtTz(newStart, teacher.timezone, "EEEE d MMMM 'at' HH:mm")

    if (!late) {
      // ---- On time: move the lesson (charged once) ----
      if (lesson.time_slot_id) {
        // Stop the regular booking putting the old date back
        const { data: slot } = await db().from('time_slots').select('skip_dates').eq('id', lesson.time_slot_id).eq('teacher_id', teacher.id).maybeSingle()
        const oldDate = fmtTz(lesson.starts_at, teacher.timezone, 'yyyy-MM-dd')
        if (slot && !slot.skip_dates.includes(oldDate)) {
          must(await db().from('time_slots').update({ skip_dates: [...slot.skip_dates, oldDate].sort() }).eq('id', lesson.time_slot_id).eq('teacher_id', teacher.id).select('id'))
        }
      }
      must(
        await db()
          .from('lessons')
          .update({ starts_at: newStart, time_slot_id: null, reminder_sent_at: null, notes: addNote(lesson.notes, `Moved from ${oldWhen} by ${by}${note ? `: ${note}` : '.'}`) })
          .eq('id', lesson.id)
          .eq('teacher_id', teacher.id)
          .select('id'),
      )
    } else {
      // ---- Late: original still charged; the new time is an extra lesson ----
      must(
        await db()
          .from('lessons')
          .update({ status: 'absent', notes: addNote(lesson.notes, `Rescheduled by ${by} with less than 24 hours’ notice (charged) — rebooked for ${newWhen}.`) })
          .eq('id', lesson.id)
          .eq('teacher_id', teacher.id)
          .select('id'),
      )
      must(
        await db()
          .from('lessons')
          .insert({
            teacher_id: teacher.id,
            student_id: lesson.student_id,
            starts_at: newStart,
            duration_minutes: lesson.duration_minutes,
            price: lesson.price,
            instrument: lesson.instrument,
            location: lesson.location,
            notes: `Extra lesson booked by ${by} (late reschedule of ${oldWhen})${note ? `: ${note}` : '.'}`,
          })
          .select('id'),
      )
    }

    await tellTeacher(
      teacher,
      `${fullName(lesson.students)} moved a lesson to ${fmtTz(newStart, teacher.timezone, 'EEE d MMM, HH:mm')}`,
      'Lesson rescheduled',
      [
        ['Pupil', fullName(lesson.students)],
        ['Was', oldWhen],
        ['Now', newWhen],
        ['Notice', late ? 'Less than 24 hours — original still charged, new lesson is an extra' : '24 hours or more — moved, charged once'],
      ],
      note,
      by,
    )
  })
  if (result?.error) return result
  revalidatePath('/family', 'layout')
  revalidatePath('/schedule', 'layout')
  revalidatePath('/')
  redirect('/family/lessons?changed=moved')
}
