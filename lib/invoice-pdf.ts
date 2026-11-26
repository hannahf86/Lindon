// =============================================================================
// lib/invoice-pdf.ts — a branded A4 PDF of an invoice (pdf-lib, server-side)
//
// Layout: a header band in the teacher's main colour with their logo (PNG /
// JPG from Settings → Invoicing) and studio name, an accent stripe, then
// invoice number + status, bill-to and dates, the lines, the total, how to
// pay, any note, and the footer small print. Fonts are Helvetica (built in),
// so characters it can't draw (emoji etc.) are swapped for plain ones.
// Used by the "Download PDF" links and attached to invoice emails.
// =============================================================================
import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import { db, must } from './db'
import { fmtDate } from './dates'
import { money } from './format'
import type { Invoice, Teacher } from './database.types'

// ---- Helpers ----
const A4: [number, number] = [595.28, 841.89]
const M = 48 // page margin

function hex(c: string | null | undefined, fallback: string) {
  const v = /^#[0-9a-f]{6}$/i.test(c ?? '') ? c! : fallback
  return rgb(parseInt(v.slice(1, 3), 16) / 255, parseInt(v.slice(3, 5), 16) / 255, parseInt(v.slice(5, 7), 16) / 255)
}
const INK = rgb(0.18, 0.13, 0.25)
const MUTED = rgb(0.38, 0.35, 0.45)
const LINE = rgb(0.9, 0.87, 0.93)

/** Keep to characters Helvetica (WinAnsi) can draw. */
function clean(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF£€\n]/g, '')
}

/** Split text into lines that fit a width. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of clean(text).split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line)
        line = word
      } else line = next
    }
    out.push(line)
  }
  return out
}

async function loadLogo(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
    return isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
  } catch {
    return null
  }
}

// ---- Build ----
export async function invoicePdf(teacher: Teacher, inv: Invoice): Promise<Uint8Array> {
  const items = must(await db().from('invoice_items').select('*').eq('teacher_id', teacher.id).eq('invoice_id', inv.id).order('position').order('created_at'))
  const c = teacher.currency
  const brand = hex(teacher.invoice_color, '#5B3F8C')
  const accent = hex(teacher.invoice_accent, '#E3C67E')

  const pdf = await PDFDocument.create()
  pdf.setTitle(`Invoice ${inv.number}`)
  pdf.setAuthor(teacher.business_name || teacher.display_name || 'Lindon')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo = await loadLogo(pdf, teacher.logo_url ?? '')

  let page: PDFPage = pdf.addPage(A4)
  const [W, H] = A4
  let y = H

  const text = (s: string, x: number, yy: number, size = 10, f = font, color = INK) => page.drawText(clean(s), { x, y: yy, size, font: f, color })
  const right = (s: string, xr: number, yy: number, size = 10, f = font, color = INK) => text(s, xr - f.widthOfTextAtSize(clean(s), size), yy, size, f, color)
  const newPageIfNeeded = (need: number) => {
    if (y - need < M + 40) {
      page = pdf.addPage(A4)
      y = H - M
    }
  }

  // ---- Header band: logo + studio name ----
  const bandH = 96
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: brand })
  page.drawRectangle({ x: 0, y: H - bandH - 6, width: W, height: 6, color: accent })
  let textX = M
  if (logo) {
    const maxH = 60
    const maxW = 140
    const scale = Math.min(maxH / logo.height, maxW / logo.width)
    const w = logo.width * scale
    const h = logo.height * scale
    // White tile behind the logo so any logo reads on the band
    page.drawRectangle({ x: M - 6, y: H - bandH / 2 - h / 2 - 6, width: w + 12, height: h + 12, color: rgb(1, 1, 1) })
    page.drawImage(logo, { x: M, y: H - bandH / 2 - h / 2, width: w, height: h })
    textX = M + w + 24
  }
  const studio = teacher.business_name || teacher.display_name || 'Music lessons'
  text(studio, textX, H - 48, 20, bold, rgb(1, 1, 1))
  if (teacher.business_name && teacher.display_name) text(teacher.display_name, textX, H - 66, 11, font, rgb(1, 1, 1))
  right('INVOICE', W - M, H - 44, 12, bold, rgb(1, 1, 1))
  right(inv.number, W - M, H - 64, 18, bold, rgb(1, 1, 1))
  y = H - bandH - 40

  // ---- From (teacher) / Bill to / dates ----
  const col2 = W / 2 + 10
  text('FROM', M, y, 8, bold, MUTED)
  text('BILL TO', col2, y, 8, bold, MUTED)
  y -= 14
  const fromLines = [studio, ...wrap(teacher.address || '', font, 10, W / 2 - M - 10), [teacher.email, teacher.phone].filter(Boolean).join('  ·  ')].filter(Boolean)
  const toLines = [inv.bill_to_name, ...wrap(inv.bill_to_address || '', font, 10, W / 2 - M - 10), inv.bill_to_email].filter(Boolean)
  const rows = Math.max(fromLines.length, toLines.length)
  for (let i = 0; i < rows; i++) {
    if (fromLines[i]) text(fromLines[i], M, y, 10, i === 0 ? bold : font)
    if (toLines[i]) text(toLines[i], col2, y, 10, i === 0 ? bold : font)
    y -= 14
  }
  y -= 10
  const dates: [string, string][] = [['Issued', fmtDate(inv.issue_date, 'd MMMM yyyy')]]
  if (inv.due_date) dates.push(['Due', fmtDate(inv.due_date, 'd MMMM yyyy')])
  if (inv.status === 'paid' && inv.paid_on) dates.push(['Paid', fmtDate(inv.paid_on, 'd MMMM yyyy')])
  for (const [k, v] of dates) {
    text(k, M, y, 10, font, MUTED)
    text(v, M + 60, y, 10, bold)
    y -= 14
  }
  if (inv.status === 'paid') {
    right('PAID', W - M, y + 14 * dates.length - 4, 16, bold, brand)
  }
  y -= 16

  // ---- Lines ----
  const showQty = items.some((it) => Number(it.quantity) !== 1)
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 1, color: LINE })
  text('DESCRIPTION', M, y - 8, 8, bold, MUTED)
  if (showQty) {
    right('QTY', W - M - 170, y - 8, 8, bold, MUTED)
    right('PRICE', W - M - 90, y - 8, 8, bold, MUTED)
  }
  right('AMOUNT', W - M, y - 8, 8, bold, MUTED)
  y -= 22
  const descW = showQty ? W - 2 * M - 200 : W - 2 * M - 100
  for (const it of items) {
    const lines = wrap(it.description, font, 10, descW)
    newPageIfNeeded(lines.length * 13 + 12)
    lines.forEach((l, i) => text(l, M, y - i * 13, 10))
    if (showQty) {
      right(String(Number(it.quantity)), W - M - 170, y, 10)
      right(money(it.unit_price, c), W - M - 90, y, 10)
    }
    right(money(it.amount, c), W - M, y, 10, Number(it.amount) < 0 ? font : font)
    y -= lines.length * 13 + 8
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: LINE })
    y -= 6
  }
  newPageIfNeeded(40)
  text('Total', M, y - 6, 13, bold)
  right(money(inv.total, c), W - M, y - 6, 15, bold, brand)
  y -= 40

  // ---- How to pay / note ----
  const block = (title: string, body: string) => {
    if (!body.trim()) return
    const lines = wrap(body, font, 10, W - 2 * M - 24)
    const h = lines.length * 13 + 30
    newPageIfNeeded(h + 10)
    page.drawRectangle({ x: M, y: y - h + 10, width: W - 2 * M, height: h, color: rgb(0.94, 0.92, 0.97) })
    text(title, M + 12, y - 8, 10, bold)
    lines.forEach((l, i) => text(l, M + 12, y - 24 - i * 13, 10))
    y -= h + 14
  }
  if (inv.status !== 'paid') block('How to pay', teacher.payment_details || '')
  block('Note', inv.notes || '')

  // ---- Footer small print on the last page ----
  if (teacher.invoice_footer) {
    const lines = wrap(teacher.invoice_footer, font, 8, W - 2 * M)
    lines.forEach((l, i) => text(l, M, M + (lines.length - 1 - i) * 10, 8, font, MUTED))
  }

  return pdf.save()
}

/** The invoice row (for routes that only have an id). */
export async function invoiceForPdf(teacherId: string, invoiceId: string): Promise<Invoice | null> {
  const { data } = await db().from('invoices').select('*').eq('id', invoiceId).eq('teacher_id', teacherId).maybeSingle()
  return data ?? null
}
