// =============================================================================
// lib/monthly-invoices.ts — "Create next month's invoices" for every pupil
//
// Lessons are billed monthly in advance. For each active pupil this makes a
// DRAFT invoice holding their not-yet-invoiced lessons for the chosen month,
// then takes off any make-up credits waiting (lib/credits.ts). Pupils with no
// lessons that month are skipped. Nothing is sent — the teacher checks the
// drafts, then emails them.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { addDaysISO, monthBounds } from './dates'
import { addLessonLines, billToFor, uninvoicedLessons } from './invoices'
import { applyCredits } from './credits'
import { fullName } from './format'
import type { Teacher } from './database.types'

export type MonthlyRunResult = {
  created: { invoiceId: string; number: string; name: string; lessons: number; credits: number }[]
  skipped: string[] // pupils with nothing to bill
}

/** Create a draft invoice (number, bill-to, due date) for one pupil. */
export async function newDraftInvoice(teacher: Teacher, studentId: string, issueDate: string): Promise<{ id: string; number: string }> {
  const billTo = await billToFor(teacher.id, studentId)
  if (!billTo) throw new Error('That pupil no longer exists.')
  const { data: number, error } = await db().rpc('next_invoice_number', { p_teacher: teacher.id })
  if (error || !number) throw new Error(error?.message ?? 'Could not allocate an invoice number.')
  return must(
    await db()
      .from('invoices')
      .insert({
        teacher_id: teacher.id,
        student_id: studentId,
        number,
        bill_to_name: billTo.name,
        bill_to_email: billTo.email,
        bill_to_address: billTo.address,
        issue_date: issueDate,
        due_date: addDaysISO(issueDate, teacher.invoice_terms_days),
        status: 'draft',
      })
      .select('id, number')
      .single(),
  )
}

/** Make draft invoices for every active pupil's lessons in the month containing `monthISO`. */
export async function createMonthlyInvoices(teacher: Teacher, monthISO: string, issueDate: string): Promise<MonthlyRunResult> {
  const [from, to] = monthBounds(monthISO)
  const pupils = must(
    await db().from('students').select('id, first_name, last_name').eq('teacher_id', teacher.id).eq('status', 'active').order('first_name'),
  )
  const result: MonthlyRunResult = { created: [], skipped: [] }
  for (const p of pupils) {
    const lessons = await uninvoicedLessons(teacher, p.id, from, to)
    if (lessons.length === 0) {
      result.skipped.push(fullName(p))
      continue
    }
    const inv = await newDraftInvoice(teacher, p.id, issueDate)
    const added = await addLessonLines(teacher, inv.id, p.id, from, to)
    const credits = await applyCredits(teacher, inv.id, p.id)
    result.created.push({ invoiceId: inv.id, number: inv.number, name: fullName(p), lessons: added, credits: credits.count })
  }
  return result
}
