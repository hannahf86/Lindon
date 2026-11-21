// =============================================================================
// lib/addons.ts — exam fees and instrument hire as add-ons to invoices
//
// · pendingHire() / addHireLines()      — monthly fees for items on paid hire
// · pendingExamFees() / addExamFeeLine() — one-off exam entry fees
// · examFeeInvoice()                    — the invoice an exam's fee is already on
//
// Hire is charged for any month the item is out for at least part of, at the
// full monthly fee. It stops once the item is marked returned. Each line links
// back to its loan or exam, and a fee on a live (non-void) invoice is never
// offered twice; voiding the invoice frees it up again.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { fmtDate, monthBounds } from './dates'
import { FormError } from './forms'
import { nextPosition } from './invoices'
import type { Teacher } from './database.types'

// ---- Hire ----------------------------------------------------------------------------
export type PendingHire = { loanId: string; month: string; description: string; amount: number }

/** Paid-hire items out at some point in the month containing `monthISO`, and not yet billed for it. */
export async function pendingHire(teacher: Teacher, studentId: string, monthISO: string): Promise<PendingHire[]> {
  const [from, to] = monthBounds(monthISO)
  const loans = must(
    await db()
      .from('loans')
      .select('id, hire_fee, lent_on, returned_on, library_items(title)')
      .eq('teacher_id', teacher.id)
      .eq('student_id', studentId)
      .gt('hire_fee', 0)
      .lte('lent_on', to)
      .order('lent_on'),
  ).filter((l) => !l.returned_on || l.returned_on >= from)
  if (loans.length === 0) return []

  const billed = must(
    await db()
      .from('invoice_items')
      .select('loan_id, invoices(status)')
      .eq('teacher_id', teacher.id)
      .eq('hire_month', from)
      .in(
        'loan_id',
        loans.map((l) => l.id),
      ),
  )
  const taken = new Set(billed.filter((b) => b.invoices && b.invoices.status !== 'void').map((b) => b.loan_id))
  return loans
    .filter((l) => !taken.has(l.id))
    .map((l) => ({
      loanId: l.id,
      month: from,
      description: `Hire: ${l.library_items?.title ?? 'item'} — ${fmtDate(from, 'MMMM yyyy')}`,
      amount: Number(l.hire_fee),
    }))
}

/** Add this month's hire to an invoice (all of it, or just one loan). Returns how many lines were added. */
export async function addHireLines(teacher: Teacher, invoiceId: string, studentId: string, monthISO: string, onlyLoanId?: string): Promise<number> {
  const pending = (await pendingHire(teacher, studentId, monthISO)).filter((h) => !onlyLoanId || h.loanId === onlyLoanId)
  if (pending.length === 0) return 0
  const start = await nextPosition(teacher.id, invoiceId)
  must(
    await db()
      .from('invoice_items')
      .insert(
        pending.map((h, i) => ({
          teacher_id: teacher.id,
          invoice_id: invoiceId,
          kind: 'hire' as const,
          description: h.description,
          quantity: 1,
          unit_price: h.amount,
          loan_id: h.loanId,
          hire_month: h.month,
          position: start + i,
        })),
      )
      .select('id'),
  )
  return pending.length
}

// ---- Exam fees -------------------------------------------------------------------------
export type PendingExamFee = { examId: string; description: string; amount: number }

function examFeeDescription(e: { board: string; instrument: string; grade: string }): string {
  const what = [e.board, e.instrument, e.grade && `Grade ${e.grade.replace(/^grade\s*/i, '')}`].filter(Boolean).join(' ')
  return what ? `Exam fee: ${what}` : 'Exam fee'
}

/** The live invoice an exam's fee is on, if any. */
export async function examFeeInvoice(teacherId: string, examId: string): Promise<{ id: string; number: string } | null> {
  const rows = must(await db().from('invoice_items').select('invoices(id, number, status)').eq('teacher_id', teacherId).eq('exam_id', examId))
  const live = rows.find((r) => r.invoices && r.invoices.status !== 'void')?.invoices
  return live ? { id: live.id, number: live.number } : null
}

/** Exams with a fee that isn't on a live invoice yet (withdrawn exams are left out). */
export async function pendingExamFees(teacherId: string, studentId: string): Promise<PendingExamFee[]> {
  const exams = must(
    await db()
      .from('exams')
      .select('id, board, instrument, grade, fee, status')
      .eq('teacher_id', teacherId)
      .eq('student_id', studentId)
      .gt('fee', 0)
      .neq('status', 'withdrawn')
      .order('exam_date'),
  )
  if (exams.length === 0) return []
  const billed = must(
    await db()
      .from('invoice_items')
      .select('exam_id, invoices(status)')
      .eq('teacher_id', teacherId)
      .in(
        'exam_id',
        exams.map((e) => e.id),
      ),
  )
  const taken = new Set(billed.filter((b) => b.invoices && b.invoices.status !== 'void').map((b) => b.exam_id))
  return exams.filter((e) => !taken.has(e.id)).map((e) => ({ examId: e.id, description: examFeeDescription(e), amount: Number(e.fee) }))
}

/** Put one exam's fee on an invoice. Refuses if it's already on a live invoice. */
export async function addExamFeeLine(teacher: Teacher, invoiceId: string, studentId: string, examId: string): Promise<void> {
  const fee = (await pendingExamFees(teacher.id, studentId)).find((f) => f.examId === examId)
  if (!fee) throw new FormError('That exam fee is already on an invoice, or the exam has no fee.')
  must(
    await db()
      .from('invoice_items')
      .insert({
        teacher_id: teacher.id,
        invoice_id: invoiceId,
        kind: 'exam',
        description: fee.description,
        quantity: 1,
        unit_price: fee.amount,
        exam_id: examId,
        position: await nextPosition(teacher.id, invoiceId),
      })
      .select('id'),
  )
}
