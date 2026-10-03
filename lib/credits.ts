// =============================================================================
// lib/credits.ts — make-up credits
//
// Credits are created/removed by a database trigger when a lesson's attendance
// is set to "notice given" or "teacher cancelled" (see 0005 migration). This
// file handles everything around them:
//   • availableCredits()  — a pupil's unused credits (they never expire)
//   • applyCredits()      — add them to an invoice as minus lines, oldest
//                           first, never taking the invoice below zero
//   • notifyCreditIssued()— email the parent / adult pupil that a credit is
//                           waiting and will come off next month's invoice
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { duration, fullName, money } from './format'
import { fmtTz } from './dates'
import { recipientsFor } from './recipients'
import { sendEmail, signature, studioName } from './email'
import { creditIssuedEmail } from './email-templates'
import { nextPosition } from './invoices'
import type { CreditReason, LessonCredit, Teacher } from './database.types'

export const REASON_TEXT: Record<CreditReason, string> = {
  notice_given: 'cancelled with notice',
  teacher_cancelled: 'cancelled by teacher',
  manual: 'credit',
}

type CreditWithLesson = LessonCredit & { lessons: { starts_at: string; instrument: string; duration_minutes: number } | null }

/** A pupil's unused credits, oldest first. */
export async function availableCredits(teacherId: string, studentId: string): Promise<CreditWithLesson[]> {
  return must(
    await db()
      .from('lesson_credits')
      .select('*, lessons(starts_at, instrument, duration_minutes)')
      .eq('teacher_id', teacherId)
      .eq('student_id', studentId)
      .is('invoice_item_id', null)
      .order('created_at'),
  )
}

/** "Make-up credit: Piano lesson Tue 7 Oct (cancelled by teacher)" */
export function creditDescription(c: CreditWithLesson, timeZone: string): string {
  if (!c.lessons) return `Credit${c.note ? `: ${c.note}` : ''}`
  const what = c.lessons.instrument ? `${c.lessons.instrument} lesson` : 'Lesson'
  return `Make-up credit: ${what} ${fmtTz(c.lessons.starts_at, timeZone, 'EEE d MMM')} (${REASON_TEXT[c.reason]})`
}

/**
 * Put a pupil's available credits onto an invoice as minus lines.
 * Credits are only used while they fit inside what the invoice is charging,
 * so a total never goes negative; any left over wait for the next invoice.
 * Returns how many were applied and their total.
 */
export async function applyCredits(teacher: Teacher, invoiceId: string, studentId: string): Promise<{ count: number; total: number }> {
  const credits = await availableCredits(teacher.id, studentId)
  if (credits.length === 0) return { count: 0, total: 0 }

  // What's left on the invoice to take credits off
  const { data: inv } = await db().from('invoices').select('total').eq('id', invoiceId).eq('teacher_id', teacher.id).single()
  let room = Number(inv?.total ?? 0)

  let count = 0
  let total = 0
  for (const c of credits) {
    const amount = Number(c.amount)
    if (amount > room + 0.001) continue
    const item = must(
      await db()
        .from('invoice_items')
        .insert({
          teacher_id: teacher.id,
          invoice_id: invoiceId,
          kind: 'credit',
          description: creditDescription(c, teacher.timezone),
          quantity: 1,
          unit_price: -amount,
          credit_id: c.id,
          position: await nextPosition(teacher.id, invoiceId),
        })
        .select('id')
        .single(),
    )
    // Claim the credit — only if it's still free (guards against double use)
    const claimed = must(
      await db()
        .from('lesson_credits')
        .update({ invoice_item_id: item.id })
        .eq('id', c.id)
        .eq('teacher_id', teacher.id)
        .is('invoice_item_id', null)
        .select('id'),
    )
    if (claimed.length === 0) {
      await db().from('invoice_items').delete().eq('id', item.id).eq('teacher_id', teacher.id)
      continue
    }
    room -= amount
    count++
    total += amount
  }
  return { count, total }
}

/**
 * Email the family about a newly issued credit. Called after a lesson is
 * marked "notice given" / "teacher cancelled". Never throws — returns a short
 * note for the teacher's confirmation message.
 */
export async function notifyCreditIssued(teacher: Teacher, lessonId: string): Promise<string> {
  const { data: credit } = await db()
    .from('lesson_credits')
    .select('*, lessons(starts_at, instrument, duration_minutes), students(id, first_name, last_name)')
    .eq('teacher_id', teacher.id)
    .eq('lesson_id', lessonId)
    .maybeSingle()
  if (!credit || !credit.lessons || !credit.students) return ''

  const { recipients } = await recipientsFor(teacher.id, [credit.student_id])
  if (recipients.length === 0) return ' No email address on file, so the family wasn’t emailed.'

  const balance = (await availableCredits(teacher.id, credit.student_id)).reduce((n, c) => n + Number(c.amount), 0)
  const result = await sendEmail({
    teacher,
    to: recipients.map((r) => r.email),
    kind: 'credit_notice',
    lessonId,
    email: creditIssuedEmail({
      studio: studioName(teacher),
      studentName: fullName(credit.students),
      lessonWhen: fmtTz(credit.lessons.starts_at, teacher.timezone, "EEEE d MMMM 'at' HH:mm"),
      lessonWhat: [credit.lessons.instrument, duration(credit.lessons.duration_minutes)].filter(Boolean).join(', '),
      reason: credit.reason === 'teacher_cancelled' ? 'teacher' : 'notice',
      amount: money(credit.amount, teacher.currency),
      balance: money(balance, teacher.currency),
      signature: signature(teacher),
    }),
  })
  return result.sent > 0
    ? ` ${recipients.map((r) => r.name || r.email).join(', ')} ${recipients.length === 1 ? 'has' : 'have'} been emailed about the credit.`
    : ` The credit email didn’t send (${result.error ?? 'unknown problem'}).`
}
