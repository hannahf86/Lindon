// =============================================================================
// lib/invoices.ts — invoice helpers shared by the invoice pages and actions
//
// · billToFor()          — who the invoice is addressed to (parent for under-18s)
// · uninvoicedLessons()  — chargeable lessons for a student not yet on a live invoice
// · addLessonLines()     — turn those lessons into invoice lines
// · displayStatus()      — draft / sent / overdue / paid / void for badges
// · nextPosition()       — where a new line goes at the bottom of the invoice
//
// Every query is scoped by teacher_id. invoices.total is kept up to date by a
// database trigger, and invoice_items.amount is a generated column — neither
// is ever written from here.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { duration, fullName, isMinor } from './format'
import { fmtTz, rangeBoundsUtc } from './dates'
import type { Invoice, Lesson, Teacher } from './database.types'

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'] as const
export const ITEM_KINDS = ['lesson', 'equipment', 'other'] as const

/** Kind choices for the Segmented pills on line items. */
export const KIND_OPTIONS = [
  { value: 'lesson', label: 'Lesson' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
] as const

// ---- Status shown to the teacher -----------------------------------------------------
/** "overdue" is not stored — it's a sent invoice past its due date (teacher's today). */
export function displayStatus(inv: Pick<Invoice, 'status' | 'due_date'>, today: string): string {
  return inv.status === 'sent' && inv.due_date && inv.due_date < today ? 'overdue' : inv.status
}

/** Paid and void invoices are locked; reopen as a draft to change them. */
export function isEditable(inv: Pick<Invoice, 'status'>): boolean {
  return inv.status === 'draft' || inv.status === 'sent'
}

// ---- Bill-to -----------------------------------------------------------------------
export type BillTo = { name: string; email: string; address: string }

/**
 * Under-18s are billed to their main contact (or the first contact who gets
 * emails, or failing that any linked contact). Adults are billed directly.
 */
export async function billToFor(teacherId: string, studentId: string): Promise<BillTo | null> {
  const { data: s } = await db()
    .from('students')
    .select('first_name, last_name, email, address, date_of_birth, is_minor, student_guardians(is_primary, receives_emails, guardians(first_name, last_name, email, address))')
    .eq('id', studentId)
    .eq('teacher_id', teacherId)
    .maybeSingle()
  if (!s) return null

  if (isMinor(s)) {
    const links = (s.student_guardians ?? []).filter((l) => l.guardians)
    const pick = links.find((l) => l.is_primary) ?? links.find((l) => l.receives_emails) ?? links[0]
    const g = pick?.guardians
    if (g) return { name: fullName(g), email: g.email, address: g.address || s.address }
  }
  return { name: fullName(s), email: s.email, address: s.address }
}

// ---- Lessons not yet invoiced ---------------------------------------------------------
type LessonRow = Pick<Lesson, 'id' | 'starts_at' | 'duration_minutes' | 'price' | 'instrument' | 'status'>

/**
 * Chargeable lessons for one student between two dates (inclusive, in the
 * teacher's timezone) that aren't already on a non-void invoice.
 * Lessons are billed monthly in advance, so every chargeable lesson is billed
 * whatever its attendance; a cancelled one earns a make-up credit, which comes
 * off a later invoice (lib/credits.ts) instead of being left off this one.
 */
export async function uninvoicedLessons(teacher: Teacher, studentId: string, from: string, to: string): Promise<LessonRow[]> {
  const [start, end] = rangeBoundsUtc(from, to, teacher.timezone)
  const lessons = must(
    await db()
      .from('lessons')
      .select('id, starts_at, duration_minutes, price, instrument, status')
      .eq('teacher_id', teacher.id)
      .eq('student_id', studentId)
      .eq('chargeable', true)
      .gte('starts_at', start)
      .lt('starts_at', end)
      .order('starts_at'),
  )
  if (lessons.length === 0) return []

  // Which of these are already billed on an invoice that hasn't been voided?
  const billed = must(
    await db()
      .from('invoice_items')
      .select('lesson_id, invoices(status)')
      .eq('teacher_id', teacher.id)
      .in(
        'lesson_id',
        lessons.map((l) => l.id),
      ),
  )
  const taken = new Set(billed.filter((b) => b.invoices && b.invoices.status !== 'void').map((b) => b.lesson_id))
  return lessons.filter((l) => !taken.has(l.id))
}

/** "Piano lesson — Tue 7 Oct, 30 min" (+ a note if it's already known not to have gone ahead). */
export function lessonDescription(l: LessonRow, timeZone: string): string {
  const what = l.instrument ? `${l.instrument} lesson` : 'Lesson'
  const note =
    l.status === 'notice_given' || l.status === 'teacher_cancelled' ? ' (cancelled — make-up credit issued)' : l.status === 'absent' ? ' (missed)' : ''
  return `${what} — ${fmtTz(l.starts_at, timeZone, 'EEE d MMM')}, ${duration(l.duration_minutes)}${note}`
}

/** Position for the next line added to an invoice (keeps lines in the order added). */
export async function nextPosition(teacherId: string, invoiceId: string): Promise<number> {
  const { data } = await db()
    .from('invoice_items')
    .select('position')
    .eq('teacher_id', teacherId)
    .eq('invoice_id', invoiceId)
    .order('position', { ascending: false })
    .limit(1)
  return (data?.[0]?.position ?? -1) + 1
}

/** Add one line per uninvoiced lesson to an invoice. Returns how many were added. */
export async function addLessonLines(teacher: Teacher, invoiceId: string, studentId: string, from: string, to: string): Promise<number> {
  const lessons = await uninvoicedLessons(teacher, studentId, from, to)
  if (lessons.length === 0) return 0
  const start = await nextPosition(teacher.id, invoiceId)
  must(
    await db()
      .from('invoice_items')
      .insert(
        lessons.map((l, i) => ({
          teacher_id: teacher.id,
          invoice_id: invoiceId,
          kind: 'lesson' as const,
          description: lessonDescription(l, teacher.timezone),
          quantity: 1,
          unit_price: Number(l.price),
          lesson_id: l.id,
          position: start + i,
        })),
      )
      .select('id'),
  )
  return lessons.length
}
