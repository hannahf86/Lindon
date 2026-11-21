// =============================================================================
// lib/monthly-invoices.ts — "Create next month's invoices" for every pupil
//
// Lessons are billed monthly in advance. For each active pupil this makes a
// DRAFT invoice holding their not-yet-invoiced lessons and any instrument hire
// for the chosen month, then takes off any make-up credits waiting
// (lib/credits.ts). If the pupil already has a draft holding only add-ons
// (equipment or an exam fee), the month's lines join that draft, so the family
// gets one invoice. Pupils with nothing to bill are skipped. Nothing is sent —
// the teacher checks the drafts, then emails them.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { addDaysISO, monthBounds } from './dates'
import { addLessonLines, billToFor, uninvoicedLessons } from './invoices'
import { addHireLines, pendingHire } from './addons'
import { applyCredits } from './credits'
import { fullName } from './format'
import type { Teacher } from './database.types'

export type MonthlyRunResult = {
  created: { invoiceId: string; number: string; name: string; lessons: number; hire: number; credits: number }[]
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

/** A draft with no lessons on it (only add-ons), brought up to this run's dates; null if there isn't one. */
async function addOnDraft(teacher: Teacher, studentId: string, issueDate: string): Promise<{ id: string; number: string } | null> {
  const drafts = must(
    await db()
      .from('invoices')
      .select('id, number, invoice_items(kind)')
      .eq('teacher_id', teacher.id)
      .eq('student_id', studentId)
      .eq('status', 'draft')
      .order('created_at', { ascending: false }),
  )
  const draft = drafts.find((d) => !d.invoice_items.some((it) => it.kind === 'lesson'))
  if (!draft) return null
  must(
    await db()
      .from('invoices')
      .update({ issue_date: issueDate, due_date: addDaysISO(issueDate, teacher.invoice_terms_days) })
      .eq('id', draft.id)
      .eq('teacher_id', teacher.id)
      .select('id'),
  )
  return { id: draft.id, number: draft.number }
}

/** Make draft invoices for every active pupil's lessons and hire in the month containing `monthISO`. */
export async function createMonthlyInvoices(teacher: Teacher, monthISO: string, issueDate: string): Promise<MonthlyRunResult> {
  const [from, to] = monthBounds(monthISO)
  const pupils = must(
    await db().from('students').select('id, first_name, last_name').eq('teacher_id', teacher.id).eq('status', 'active').order('first_name'),
  )
  const result: MonthlyRunResult = { created: [], skipped: [] }
  for (const p of pupils) {
    const [lessons, hire] = await Promise.all([uninvoicedLessons(teacher, p.id, from, to), pendingHire(teacher, p.id, from)])
    if (lessons.length === 0 && hire.length === 0) {
      result.skipped.push(fullName(p))
      continue
    }
    const inv = (await addOnDraft(teacher, p.id, issueDate)) ?? (await newDraftInvoice(teacher, p.id, issueDate))
    const added = await addLessonLines(teacher, inv.id, p.id, from, to)
    const hired = await addHireLines(teacher, inv.id, p.id, from)
    const credits = await applyCredits(teacher, inv.id, p.id)
    result.created.push({ invoiceId: inv.id, number: inv.number, name: fullName(p), lessons: added, hire: hired, credits: credits.count })
  }
  return result
}
