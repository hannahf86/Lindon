'use server'
// =============================================================================
// lessons/actions.ts — one-off lessons (page or calendar pop-up), editing lesson details, lesson notes
// (optionally emailed to parents), quick "mark completed", "send reminder
// now" and delete. Every query is scoped to the signed-in teacher.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { bool, date, handle, int, num, oneOf, parseTime, ref, required, str, FormError, type ActionState } from '@/lib/forms'
import { zonedToUtc } from '@/lib/dates'
import { sendLessonReminder } from '@/lib/reminders'
import { CREDIT_STATUSES, LESSON_STATUSES } from '@/lib/lessons'
import { notifyCreditIssued } from '@/lib/credits'
import { usesCredits } from '@/lib/features'
import { rememberLocation } from '@/lib/locations'
import type { LessonStatus, Teacher } from '@/lib/database.types'

/** Date / time / length / price / instrument / location (shared by create + update). */
function readDetails(fd: FormData, timeZone: string) {
  const day = date(fd, 'date')
  if (!day) throw new FormError('Date is required.')
  const time = parseTime(required(fd, 'time', 'Start time'), 'Start time')
  return {
    starts_at: zonedToUtc(day, time, timeZone),
    duration_minutes: int(fd, 'duration_minutes', 'Length (minutes)', { min: 5, max: 600 }),
    price: num(fd, 'price', 'Price', { min: 0, fallback: 0 }),
    instrument: str(fd, 'instrument'),
    location: str(fd, 'location'),
  }
}

/** readDetails + add a newly typed location to the teacher's saved list. */
async function detailsRemembered(fd: FormData, teacher: Teacher) {
  const details = readDetails(fd, teacher.timezone)
  await rememberLocation(teacher, details.location)
  return details
}

function revalidateLesson(id: string, studentId?: string | null) {
  revalidatePath('/lessons')
  revalidatePath(`/lessons/${id}`)
  revalidatePath('/schedule')
  revalidatePath('/')
  if (studentId) revalidatePath(`/students/${studentId}`)
}

// ---- Create a one-off lesson ---------------------------------------------------------
export async function createLesson(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = ''
  let studentId = ''
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const student_id = ref(fd, 'student_id')
    if (!student_id) throw new FormError('Choose a student.')
    studentId = student_id
    const row = must(
      await db()
        .from('lessons')
        .insert({ ...(await detailsRemembered(fd, teacher)), student_id, teacher_id: teacher.id })
        .select('id')
        .single(),
    )
    id = row.id
  })
  if (result?.error) return result
  revalidateLesson(id, studentId)
  redirect(`/lessons/${id}`)
}

// ---- Add a one-off lesson from the calendar pop-up (stays on the calendar) ---------------
export async function addLessonFromCalendar(_: ActionState, fd: FormData): Promise<ActionState> {
  let studentId = ''
  let id = ''
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const student_id = ref(fd, 'student_id')
    if (!student_id) throw new FormError('Choose a student.')
    studentId = student_id
    const row = must(await db().from('lessons').insert({ ...(await detailsRemembered(fd, teacher)), student_id, teacher_id: teacher.id }).select('id').single())
    id = row.id
    return { ok: 'Lesson added.' }
  })
  if (result?.ok) revalidateLesson(id, studentId)
  return result
}

// ---- Update lesson details -----------------------------------------------------------
export async function updateLesson(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const { data: before } = await db().from('lessons').select('starts_at, student_id, status').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
    if (!before) throw new FormError('That lesson no longer exists.')
    const details = await detailsRemembered(fd, teacher)
    const moved = new Date(before.starts_at).toISOString() !== details.starts_at
    const status = oneOf(fd, 'status', LESSON_STATUSES, 'scheduled')
    must(
      await db()
        .from('lessons')
        .update({
          ...details,
          status,
          chargeable: bool(fd, 'chargeable'),
          // A lesson moved to a new time should get a fresh reminder
          ...(moved ? { reminder_sent_at: null } : {}),
        })
        .eq('id', id)
        .eq('teacher_id', teacher.id)
        .select('id')
        .single(),
    )
    revalidateLesson(id, before.student_id)
    return { ok: 'Lesson updated.' + (await creditNote(teacher, id, before.status, status)) }
  })
}

// ---- Quick actions ---------------------------------------------------------------------
const ATTENDANCE_WORDS: Record<LessonStatus, string> = {
  scheduled: 'not yet taken',
  present: 'present',
  absent: 'absent',
  notice_given: 'notice given',
  teacher_cancelled: 'cancelled by you',
}

/**
 * After an attendance change: if it newly earned a make-up credit, email the
 * family and say so; if it took a credit away, say that too.
 */
async function creditNote(teacher: Awaited<ReturnType<typeof requireTeacher>>, lessonId: string, from: LessonStatus, to: LessonStatus): Promise<string> {
  // Billing in arrears: no credits — a cancelled lesson just isn't charged
  if (!usesCredits(teacher)) return (CREDIT_STATUSES as readonly string[]).includes(to) ? ' It won’t be charged.' : ''
  const was = (CREDIT_STATUSES as readonly string[]).includes(from)
  const now = (CREDIT_STATUSES as readonly string[]).includes(to)
  if (now && !was) {
    const { data: credit } = await db().from('lesson_credits').select('id').eq('teacher_id', teacher.id).eq('lesson_id', lessonId).maybeSingle()
    if (!credit) return ' (No credit added — the lesson has no price.)'
    return ' A make-up credit has been added and will come off their next invoice.' + (await notifyCreditIssued(teacher, lessonId))
  }
  if (was && !now) return ' Its make-up credit has been removed (unless it was already on an invoice).'
  return ''
}

/** One-tap attendance (lesson page, day view): present / absent / notice given / teacher cancelled. */
export async function setAttendance(id: string, status: LessonStatus): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    if (!(LESSON_STATUSES as readonly string[]).includes(status)) throw new FormError('Unknown attendance.')
    const { data: before } = await db().from('lessons').select('status, student_id').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
    if (!before) throw new FormError('That lesson no longer exists.')
    if (before.status === status) return { ok: `Already marked ${ATTENDANCE_WORDS[status]}.` }
    must(await db().from('lessons').update({ status }).eq('id', id).eq('teacher_id', teacher.id).select('id'))
    revalidateLesson(id, before.student_id)
    revalidatePath('/schedule', 'layout') // includes Schedule → Attendance
    return { ok: `Marked ${ATTENDANCE_WORDS[status]}.` + (await creditNote(teacher, id, before.status, status)) }
  })
}

export async function sendReminderNow(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  const outcome = await sendLessonReminder(teacher, id)
  revalidatePath(`/lessons/${id}`)
  if (!outcome.ok) return { error: outcome.error ?? 'The reminder could not be sent.' }
  return { ok: `Reminder sent to ${outcome.sentTo.join(', ')}.` }
}

// ---- Delete ------------------------------------------------------------------------
// Any invoice line for this lesson is kept (it just loses the link).
export async function deleteLesson(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  const rows = must(await db().from('lessons').delete().eq('id', id).eq('teacher_id', teacher.id).select('student_id'))
  revalidateLesson(id, rows[0]?.student_id)
  redirect('/schedule')
}
