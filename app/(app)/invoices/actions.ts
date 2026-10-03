'use server'
// =============================================================================
// invoices/actions.ts — create, edit, send, pay, void and delete invoices,
// plus adding / editing / removing their lines. Every query is scoped to the
// signed-in teacher; ids from forms are always re-checked against teacher_id.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { bool, date, handle, num, oneOf, ref, required, str, FormError, type ActionState } from '@/lib/forms'
import { money } from '@/lib/format'
import { addDaysISO, fmtDate, todayISO } from '@/lib/dates'
import { sendEmail, signature, studioName } from '@/lib/email'
import { invoiceEmail } from '@/lib/email-templates'
import { addLessonLines, billToFor, isEditable, ITEM_KINDS, nextPosition } from '@/lib/invoices'
import { applyCredits } from '@/lib/credits'
import { createMonthlyInvoices } from '@/lib/monthly-invoices'
import type { Teacher } from '@/lib/database.types'

// ---- Shared helpers ------------------------------------------------------------------
/** Load one of this teacher's invoices (or fail with a friendly message). */
async function ownInvoice(teacher: Teacher, id: string) {
  const { data } = await db().from('invoices').select('*').eq('id', id).eq('teacher_id', teacher.id).maybeSingle()
  if (!data) throw new FormError('That invoice no longer exists — refresh and try again.')
  return data
}

/** Same, but refuses paid / void invoices (they're locked until reopened). */
async function editableInvoice(teacher: Teacher, id: string) {
  const inv = await ownInvoice(teacher, id)
  if (!isEditable(inv)) throw new FormError('This invoice is locked. Reopen it as a draft to make changes.')
  return inv
}

function refresh(id: string, studentId?: string | null) {
  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)
  revalidatePath('/reports')
  if (studentId) revalidatePath(`/students/${studentId}`)
}

/** Period dates from the form (both required, from ≤ to). */
function readPeriod(fd: FormData): [string, string] {
  const from = date(fd, 'from')
  const to = date(fd, 'to')
  if (!from || !to) throw new FormError('Choose both a start and end date for the lessons.')
  if (from > to) throw new FormError('The start date must be before the end date.')
  return [from, to]
}

// ---- Create --------------------------------------------------------------------------
// Allocates the next number, fills in who to bill, and (optionally) adds a
// line for every chargeable lesson in the period that isn't billed yet.
export async function createInvoice(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = ''
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const studentId = ref(fd, 'student_id')
    const includeLessons = bool(fd, 'include_lessons')
    const issueDate = date(fd, 'issue_date') ?? todayISO(teacher.timezone)
    const period = includeLessons && studentId ? readPeriod(fd) : null

    const billTo = studentId ? await billToFor(teacher.id, studentId) : null
    if (studentId && !billTo) throw new FormError('That student no longer exists — refresh and try again.')

    const { data: number, error: numberError } = await db().rpc('next_invoice_number', { p_teacher: teacher.id })
    if (numberError || !number) throw new Error(numberError?.message ?? 'Could not allocate an invoice number.')

    const inv = must(
      await db()
        .from('invoices')
        .insert({
          teacher_id: teacher.id,
          student_id: studentId,
          number,
          bill_to_name: billTo?.name ?? '',
          bill_to_email: billTo?.email ?? '',
          bill_to_address: billTo?.address ?? '',
          issue_date: issueDate,
          due_date: addDaysISO(issueDate, teacher.invoice_terms_days),
          status: 'draft',
        })
        .select('id')
        .single(),
    )
    id = inv.id
    if (studentId && period) await addLessonLines(teacher, id, studentId, period[0], period[1])
    // Take off any make-up credits the pupil has waiting
    if (studentId) await applyCredits(teacher, id, studentId)
  })
  if (result?.error) return result
  revalidatePath('/invoices')
  redirect(`/invoices/${id}?new=1`)
}

// ---- Edit the header (bill-to, dates, notes) ------------------------------------------
export async function updateInvoice(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await editableInvoice(teacher, id)
    const issueDate = date(fd, 'issue_date')
    if (!issueDate) throw new FormError('Issue date is required.')
    const dueDate = date(fd, 'due_date')
    if (dueDate && dueDate < issueDate) throw new FormError('The due date can’t be before the issue date.')
    must(
      await db()
        .from('invoices')
        .update({
          bill_to_name: required(fd, 'bill_to_name', 'Bill to'),
          bill_to_email: str(fd, 'bill_to_email'),
          bill_to_address: str(fd, 'bill_to_address'),
          issue_date: issueDate,
          due_date: dueDate,
          notes: str(fd, 'notes'),
        })
        .eq('id', id)
        .eq('teacher_id', teacher.id)
        .select('id')
        .single(),
    )
    refresh(id, inv.student_id)
    return { ok: 'Invoice details saved.' }
  })
}

// ---- Line items ------------------------------------------------------------------------
function readItem(fd: FormData) {
  return {
    kind: oneOf(fd, 'kind', ITEM_KINDS, 'other'),
    description: required(fd, 'description', 'Description'),
    quantity: num(fd, 'quantity', 'Quantity', { min: 0, fallback: 1 }),
    unit_price: num(fd, 'unit_price', 'Price', { min: 0 }),
  }
}

export async function addItem(invoiceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await editableInvoice(teacher, invoiceId)
    must(
      await db()
        .from('invoice_items')
        .insert({ ...readItem(fd), teacher_id: teacher.id, invoice_id: invoiceId, position: await nextPosition(teacher.id, invoiceId) })
        .select('id'),
    )
    refresh(invoiceId, inv.student_id)
    return { ok: 'Item added.' }
  })
}

export async function updateItem(invoiceId: string, itemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await editableInvoice(teacher, invoiceId)
    must(
      await db()
        .from('invoice_items')
        .update(readItem(fd))
        .eq('id', itemId)
        .eq('invoice_id', invoiceId)
        .eq('teacher_id', teacher.id)
        .select('id')
        .single(),
    )
    refresh(invoiceId, inv.student_id)
    return { ok: 'Saved.' }
  })
}

export async function deleteItem(invoiceId: string, itemId: string): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await editableInvoice(teacher, invoiceId)
    must(await db().from('invoice_items').delete().eq('id', itemId).eq('invoice_id', invoiceId).eq('teacher_id', teacher.id).select('id'))
    refresh(invoiceId, inv.student_id)
    return null
  })
}

// ---- Pull in lessons that aren't billed yet --------------------------------------------
export async function addUninvoicedLessons(invoiceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await editableInvoice(teacher, invoiceId)
    if (!inv.student_id) throw new FormError('This invoice isn’t linked to a student, so there are no lessons to add.')
    const [from, to] = readPeriod(fd)
    const added = await addLessonLines(teacher, invoiceId, inv.student_id, from, to)
    refresh(invoiceId, inv.student_id)
    return added
      ? { ok: `Added ${added} lesson${added === 1 ? '' : 's'}.` }
      : { ok: 'No new lessons to add — everything chargeable in those dates is already invoiced.' }
  })
}

// ---- Make-up credits ---------------------------------------------------------------------
export async function applyCreditsAction(invoiceId: string): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await editableInvoice(teacher, invoiceId)
    if (!inv.student_id) throw new FormError('This invoice isn’t linked to a pupil, so there are no credits to apply.')
    const { count, total } = await applyCredits(teacher, invoiceId, inv.student_id)
    refresh(invoiceId, inv.student_id)
    return count
      ? { ok: `Applied ${count} make-up credit${count === 1 ? '' : 's'} (${money(total, teacher.currency)}).` }
      : { error: 'No credits could be applied — the invoice total is lower than the credit waiting.' }
  })
}

// ---- Next month's invoices for everyone ---------------------------------------------------
export async function runMonthlyInvoices(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const month = str(fd, 'month')
    if (!/^\d{4}-\d{2}$/.test(month)) throw new FormError('Choose a month.')
    const issueDate = date(fd, 'issue_date') ?? todayISO(teacher.timezone)
    const r = await createMonthlyInvoices(teacher, `${month}-01`, issueDate)
    revalidatePath('/invoices')
    revalidatePath('/')
    if (r.created.length === 0) return { ok: `No new invoices needed — nobody has un-invoiced lessons in ${fmtDate(`${month}-01`, 'MMMM yyyy')}.` }
    const credits = r.created.reduce((n, c) => n + c.credits, 0)
    return {
      ok:
        `Created ${r.created.length} draft invoice${r.created.length === 1 ? '' : 's'} for ${fmtDate(`${month}-01`, 'MMMM yyyy')}` +
        (credits ? `, with ${credits} make-up credit${credits === 1 ? '' : 's'} taken off` : '') +
        `. Check them under Draft, then send.` +
        (r.skipped.length ? ` Skipped (no lessons that month): ${r.skipped.join(', ')}.` : ''),
    }
  })
}

// ---- Status changes ----------------------------------------------------------------------
export async function markSent(id: string): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await ownInvoice(teacher, id)
    if (inv.status !== 'draft') throw new FormError('Only drafts can be marked as sent.')
    must(
      await db()
        .from('invoices')
        .update({ status: 'sent', sent_at: inv.sent_at ?? new Date().toISOString() })
        .eq('id', id)
        .eq('teacher_id', teacher.id)
        .select('id'),
    )
    refresh(id, inv.student_id)
    return { ok: 'Marked as sent.' }
  })
}

export async function markPaid(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await ownInvoice(teacher, id)
    if (inv.status === 'void') throw new FormError('This invoice is void. Reopen it as a draft first.')
    must(
      await db()
        .from('invoices')
        .update({
          status: 'paid',
          paid_on: date(fd, 'paid_on') ?? todayISO(teacher.timezone),
          payment_method: str(fd, 'payment_method'),
        })
        .eq('id', id)
        .eq('teacher_id', teacher.id)
        .select('id'),
    )
    refresh(id, inv.student_id)
    return { ok: 'Payment recorded.' }
  })
}

/** Void: the invoice stays on record but no longer counts, and its lessons can be billed again. */
export async function voidInvoice(id: string): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await ownInvoice(teacher, id)
    must(await db().from('invoices').update({ status: 'void', paid_on: null }).eq('id', id).eq('teacher_id', teacher.id).select('id'))
    refresh(id, inv.student_id)
    return { ok: 'Invoice voided.' }
  })
}

export async function reopenInvoice(id: string): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await ownInvoice(teacher, id)
    must(await db().from('invoices').update({ status: 'draft', paid_on: null }).eq('id', id).eq('teacher_id', teacher.id).select('id'))
    refresh(id, inv.student_id)
    return { ok: 'Reopened as a draft.' }
  })
}

// ---- Email the invoice ---------------------------------------------------------------------
// Sends to the bill-to email. A draft becomes "sent" once it has gone out.
export async function emailInvoice(id: string): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const inv = await ownInvoice(teacher, id)
    if (inv.status === 'void') throw new FormError('This invoice is void, so it can’t be emailed.')
    if (!inv.bill_to_email) throw new FormError('Add an email address under “Bill to” first.')
    const items = must(
      await db().from('invoice_items').select('*').eq('teacher_id', teacher.id).eq('invoice_id', id).order('position').order('created_at'),
    )
    if (items.length === 0) throw new FormError('Add at least one item before emailing the invoice.')

    const c = teacher.currency
    const email = invoiceEmail({
      studio: studioName(teacher),
      number: inv.number,
      billTo: inv.bill_to_name,
      issueDate: fmtDate(inv.issue_date, 'd MMMM yyyy'),
      dueDate: inv.due_date ? fmtDate(inv.due_date, 'd MMMM yyyy') : '',
      lines: items.map((it) => ({
        description: Number(it.quantity) === 1 ? it.description : `${it.description} (${Number(it.quantity)} × ${money(it.unit_price, c)})`,
        amount: money(it.amount, c),
      })),
      total: money(inv.total, c),
      paymentDetails: inv.status === 'paid' ? '' : teacher.payment_details,
      notes: inv.status === 'paid' ? [`Paid with thanks${inv.paid_on ? ` on ${fmtDate(inv.paid_on, 'd MMMM yyyy')}` : ''}.`, inv.notes].filter(Boolean).join('\n\n') : inv.notes,
      footer: teacher.invoice_footer,
      signature: signature(teacher),
    })

    const res = await sendEmail({ teacher, to: [inv.bill_to_email], email, kind: 'invoice', invoiceId: id })
    if (res.error || res.sent === 0) throw new FormError(`The email didn’t send: ${res.error ?? 'unknown problem'}.`)

    if (inv.status === 'draft') {
      must(
        await db()
          .from('invoices')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', id)
          .eq('teacher_id', teacher.id)
          .select('id'),
      )
    }
    refresh(id, inv.student_id)
    return { ok: `Emailed to ${inv.bill_to_email}.` }
  })
}

// ---- Delete (drafts only) -------------------------------------------------------------------
// Sent invoices should be voided instead, so the numbering has no gaps on record.
export async function deleteInvoice(id: string): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const inv = await ownInvoice(teacher, id)
    if (inv.status !== 'draft') throw new FormError('Only drafts can be deleted — void this invoice instead.')
    must(await db().from('invoices').delete().eq('id', id).eq('teacher_id', teacher.id).eq('status', 'draft').select('id'))
    if (inv.student_id) revalidatePath(`/students/${inv.student_id}`)
  })
  if (result?.error) return result
  revalidatePath('/invoices')
  redirect('/invoices')
}
