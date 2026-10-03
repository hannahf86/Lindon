// =============================================================================
// lib/reports.ts — income report calculations (used by /reports and the CSV
// export). All sums are worked out here so the pages only display them.
//
// Definitions (kept deliberately simple for teachers):
// · Received    — paid invoices, by the date they were paid (paid_on)
// · Invoiced    — every invoice except void ones, by issue date
// · Outstanding — sent invoices not yet paid, right now (ignores the period)
// · Taught      — completed lessons in the period, in the teacher's timezone
// =============================================================================
import 'server-only'
import { db } from './db'
import { addDaysISO, fmtDate, isDateISO, monthBounds, rangeBoundsUtc } from './dates'
import { fullName } from './format'
import type { InvoiceItemKind, Teacher } from './database.types'

// ---- Fetch every page of a query -----------------------------------------------------
// Supabase returns at most 1,000 rows per request; a year of lessons can be more.
const PAGE = 1000
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

// ---- Periods ---------------------------------------------------------------------------
export type Period = { from: string; to: string }
export type Preset = Period & { key: string; label: string }

/** UK tax year (6 April – 5 April) containing the given date. */
function taxYear(dateISO: string): Period {
  const y = Number(dateISO.slice(0, 4))
  const start = dateISO >= `${y}-04-06` ? y : y - 1
  return { from: `${start}-04-06`, to: `${start + 1}-04-05` }
}

/** Quick-pick periods shown as links above the report. */
export function presets(today: string): Preset[] {
  const [thisFrom, thisTo] = monthBounds(today)
  const [lastFrom, lastTo] = monthBounds(addDaysISO(thisFrom, -1))
  const tax = taxYear(today)
  const lastTax = taxYear(addDaysISO(tax.from, -1))
  const y = today.slice(0, 4)
  return [
    { key: 'this-month', label: 'This month', from: thisFrom, to: thisTo },
    { key: 'last-month', label: 'Last month', from: lastFrom, to: lastTo },
    { key: 'this-tax-year', label: `Tax year ${tax.from.slice(0, 4)}–${tax.to.slice(2, 4)}`, ...tax },
    { key: 'last-tax-year', label: `Last tax year (${lastTax.from.slice(0, 4)}–${lastTax.to.slice(2, 4)})`, ...lastTax },
    { key: 'this-year', label: `Calendar year ${y}`, from: `${y}-01-01`, to: `${y}-12-31` },
  ]
}

/** Period from ?from=&to= (typed dates), falling back to this tax year. */
export function resolvePeriod(sp: Record<string, string | string[] | undefined>, today: string): Period {
  const from = typeof sp.from === 'string' && isDateISO(sp.from) ? sp.from : null
  const to = typeof sp.to === 'string' && isDateISO(sp.to) ? sp.to : null
  if (from && to) return from <= to ? { from, to } : { from: to, to: from }
  if (from) return { from, to: today > from ? today : from }
  return taxYear(today)
}

export function periodLabel(p: Period): string {
  return `${fmtDate(p.from, 'd MMM yyyy')} – ${fmtDate(p.to, 'd MMM yyyy')}`
}

// ---- Paid invoice lines (shared by the report and the CSV) -----------------------------
export type PaidLine = {
  paidOn: string
  invoiceId: string
  number: string
  billTo: string
  studentId: string | null
  student: string
  kind: InvoiceItemKind
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

type PaidInvoice = {
  id: string
  number: string
  paid_on: string | null
  total: number
  bill_to_name: string
  student_id: string | null
  students: { first_name: string; last_name: string } | null
  invoice_items: { kind: InvoiceItemKind; description: string; quantity: number; unit_price: number; amount: number; position: number }[]
}

async function paidInvoices(teacherId: string, p: Period): Promise<PaidInvoice[]> {
  return fetchAll<PaidInvoice>((a, b) =>
    db()
      .from('invoices')
      .select('id, number, paid_on, total, bill_to_name, student_id, students(first_name, last_name), invoice_items(kind, description, quantity, unit_price, amount, position)')
      .eq('teacher_id', teacherId)
      .eq('status', 'paid')
      .gte('paid_on', p.from)
      .lte('paid_on', p.to)
      .order('paid_on')
      .order('number')
      .range(a, b),
  )
}

/** One row per line on every invoice paid in the period (for the CSV). */
export async function paidLines(teacherId: string, p: Period): Promise<PaidLine[]> {
  const invoices = await paidInvoices(teacherId, p)
  return invoices.flatMap((inv) =>
    [...inv.invoice_items]
      .sort((x, y) => x.position - y.position)
      .map((it) => ({
        paidOn: inv.paid_on ?? '',
        invoiceId: inv.id,
        number: inv.number,
        billTo: inv.bill_to_name,
        studentId: inv.student_id,
        student: inv.students ? fullName(inv.students) : '',
        kind: it.kind,
        description: it.description,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unit_price),
        amount: Number(it.amount),
      })),
  )
}

// ---- The full report -------------------------------------------------------------------
export type IncomeReport = {
  received: number
  paidCount: number
  invoiced: number
  invoicedCount: number
  outstanding: number
  outstandingCount: number
  months: { month: string; label: string; received: number }[]
  byKind: { kind: InvoiceItemKind; label: string; amount: number }[]
  byStudent: { key: string; studentId: string | null; name: string; amount: number; invoices: number }[]
  lessonsTaught: number
  minutesTaught: number
}

const KIND_LABELS: Record<InvoiceItemKind, string> = { lesson: 'Lessons', equipment: 'Equipment', other: 'Other', credit: 'Make-up credits' }
const MAX_MONTHS = 36

export async function incomeReport(teacher: Teacher, p: Period): Promise<IncomeReport> {
  const t = teacher.id
  const [start, end] = rangeBoundsUtc(p.from, p.to, teacher.timezone)

  const [paid, invoiced, outstanding, lessons] = await Promise.all([
    paidInvoices(t, p),
    fetchAll<{ total: number }>((a, b) =>
      db().from('invoices').select('total').eq('teacher_id', t).neq('status', 'void').gte('issue_date', p.from).lte('issue_date', p.to).order('id').range(a, b),
    ),
    fetchAll<{ total: number }>((a, b) => db().from('invoices').select('total').eq('teacher_id', t).eq('status', 'sent').order('id').range(a, b)),
    fetchAll<{ duration_minutes: number }>((a, b) =>
      db()
        .from('lessons')
        .select('duration_minutes')
        .eq('teacher_id', t)
        .eq('status', 'present')
        .gte('starts_at', start)
        .lt('starts_at', end)
        .order('id')
        .range(a, b),
    ),
  ])

  const sum = (rows: { total: number }[]) => rows.reduce((s, r) => s + Number(r.total), 0)

  // Month-by-month received (every month in the period, even empty ones)
  const monthTotals = new Map<string, number>()
  for (const inv of paid) if (inv.paid_on) monthTotals.set(inv.paid_on.slice(0, 7), (monthTotals.get(inv.paid_on.slice(0, 7)) ?? 0) + Number(inv.total))
  const months: IncomeReport['months'] = []
  for (let m = p.from.slice(0, 7); m <= p.to.slice(0, 7) && months.length < MAX_MONTHS; ) {
    months.push({ month: m, label: fmtDate(`${m}-01`, 'MMM yyyy'), received: monthTotals.get(m) ?? 0 })
    m = addDaysISO(monthBounds(`${m}-01`)[1], 1).slice(0, 7)
  }

  // Split by kind of line
  const kinds: Record<InvoiceItemKind, number> = { lesson: 0, equipment: 0, other: 0, credit: 0 }
  for (const inv of paid) for (const it of inv.invoice_items) kinds[it.kind] += Number(it.amount)
  const byKind = (Object.keys(kinds) as InvoiceItemKind[]).map((k) => ({ kind: k, label: KIND_LABELS[k], amount: kinds[k] }))

  // By student (falls back to the bill-to name for invoices not linked to a student)
  const students = new Map<string, IncomeReport['byStudent'][number]>()
  for (const inv of paid) {
    const key = inv.student_id ?? `name:${inv.bill_to_name.toLowerCase()}`
    const name = inv.students ? fullName(inv.students) : inv.bill_to_name || 'Unnamed'
    const row = students.get(key) ?? { key, studentId: inv.student_id, name, amount: 0, invoices: 0 }
    row.amount += Number(inv.total)
    row.invoices += 1
    students.set(key, row)
  }
  const byStudent = [...students.values()].sort((a, b) => b.amount - a.amount)

  return {
    received: sum(paid),
    paidCount: paid.length,
    invoiced: sum(invoiced),
    invoicedCount: invoiced.length,
    outstanding: sum(outstanding),
    outstandingCount: outstanding.length,
    months,
    byKind,
    byStudent,
    lessonsTaught: lessons.length,
    minutesTaught: lessons.reduce((s, l) => s + l.duration_minutes, 0),
  }
}

// ---- CSV ---------------------------------------------------------------------------------
/** One CSV cell: quoted when needed, and guarded against spreadsheet formula injection. */
function cell(v: string | number): string {
  if (typeof v === 'number') return v.toFixed(2) // money, always 2dp
  let s = v
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function linesToCsv(lines: PaidLine[]): string {
  const header = ['Paid date', 'Invoice number', 'Bill to', 'Student', 'Type', 'Description', 'Quantity', 'Unit price', 'Amount']
  const rows = lines.map((l) =>
    [l.paidOn, l.number, l.billTo, l.student, KIND_LABELS[l.kind], l.description, String(l.quantity), l.unitPrice, l.amount].map(cell).join(','),
  )
  // Byte-order mark so Excel opens £ signs and accents correctly
  return '﻿' + [header.map(cell).join(','), ...rows].join('\r\n') + '\r\n'
}
