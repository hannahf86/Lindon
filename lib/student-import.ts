// =============================================================================
// lib/student-import.ts — turn a CSV file into students (and their parents)
//
// Used by Students → Import from a spreadsheet. Pure functions, no database:
//   parseCsv(text)        CSV text → rows of cells (quotes, commas inside
//                         quotes, CRLF, a UTF-8 BOM, ; separators from Excel)
//   readImport(text)      rows → students checked one by one: each comes back
//                         either ready to add or with the reason it can't be
// Column headings are matched loosely ("First name", "first_name", "Forename"
// all work), so exports from other systems mostly just work. Dates can be
// 2014-03-21 or 21/03/2014 (UK order).
// =============================================================================
import { ageFrom, splitList } from './format'

export const MAX_IMPORT_ROWS = 500
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ---- The columns we understand, and the headings that mean them ---------------------------
export const IMPORT_COLUMNS = {
  first_name: ['first name', 'firstname', 'forename', 'given name', 'student first name', 'pupil first name'],
  last_name: ['last name', 'lastname', 'surname', 'family name', 'student last name', 'student surname', 'pupil surname'],
  full_name: ['name', 'full name', 'student', 'student name', 'pupil', 'pupil name'],
  date_of_birth: ['date of birth', 'dob', 'birthday', 'birth date'],
  adult: ['adult', 'adult pupil', 'is adult', 'over 18'],
  email: ['email', 'e-mail', 'student email', 'pupil email', 'email address'],
  phone: ['phone', 'mobile', 'telephone', 'student phone', 'pupil phone', 'phone number'],
  address: ['address', 'home address'],
  instruments: ['instrument', 'instruments', 'subject'],
  level: ['level', 'grade', 'standard'],
  status: ['status'],
  start_date: ['start date', 'started', 'joined'],
  notes: ['notes', 'note', 'comments'],
  parent_first_name: ['parent first name', 'guardian first name', 'parent forename', 'contact first name'],
  parent_last_name: ['parent last name', 'parent surname', 'guardian last name', 'guardian surname', 'contact last name'],
  parent_name: ['parent', 'parent name', 'guardian', 'guardian name', 'contact name', 'parent full name'],
  parent_email: ['parent email', 'guardian email', 'contact email', 'parent e-mail'],
  parent_phone: ['parent phone', 'parent mobile', 'guardian phone', 'guardian mobile', 'contact phone'],
  relationship: ['relationship', 'parent relationship', 'relation'],
} as const
type Column = keyof typeof IMPORT_COLUMNS

/** The template teachers can download and fill in. */
export const TEMPLATE_HEADINGS = [
  'First name',
  'Last name',
  'Date of birth',
  'Adult',
  'Email',
  'Phone',
  'Instruments',
  'Level',
  'Status',
  'Start date',
  'Notes',
  'Parent first name',
  'Parent last name',
  'Parent email',
  'Parent phone',
  'Relationship',
]
export const TEMPLATE_EXAMPLES = [
  ['Tom', 'Smith', '21/03/2014', 'No', '', '', 'Piano', 'Grade 2', 'Active', '', '', 'Angharad', 'Smith', 'angharad@example.com', '07700 900123', 'Mum'],
  ['Jo', 'Brown', '', 'Yes', 'jo@example.com', '07700 900456', 'Flute, Singing', 'Beginner', 'Active', '01/09/2026', 'Prefers evenings', '', '', '', '', ''],
]

// ---- CSV ------------------------------------------------------------------------------------
/** Split CSV text into rows of cells. Handles quoted cells, "" escapes and CRLF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  // Excel in some regions saves with semicolons — guess from the first line
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const sep = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  // Drop completely empty lines
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/[_\-./()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Which column each heading is (or null when we don't use it). */
function mapHeadings(headings: string[]): (Column | null)[] {
  const taken = new Set<Column>()
  return headings.map((h) => {
    const n = norm(h)
    for (const [col, names] of Object.entries(IMPORT_COLUMNS) as [Column, readonly string[]][]) {
      if (taken.has(col)) continue
      if (n === norm(col) || names.includes(n)) {
        taken.add(col)
        return col
      }
    }
    return null
  })
}

// ---- Values -----------------------------------------------------------------------------------
/** 2014-03-21, 21/03/2014, 21-03-2014 or 21.03.14 → 2014-03-21 (null if blank, 'bad' if unreadable). */
export function readDate(v: string): string | null | 'bad' {
  const s = v.trim()
  if (!s) return null
  let y: number, m: number, d: number
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  const uk = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/)
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (uk) {
    ;[d, m, y] = [Number(uk[1]), Number(uk[2]), Number(uk[3])]
    if (y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000
  } else return 'bad'
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return 'bad'
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const yes = (v: string) => /^(y|yes|true|1|adult)$/i.test(v.trim())

function readStatus(v: string): 'active' | 'paused' | 'left' | 'bad' {
  const s = v.trim().toLowerCase()
  if (!s || s === 'active' || s === 'current') return 'active'
  if (s === 'paused' || s === 'on hold') return 'paused'
  if (['past', 'left', 'inactive', 'former', 'archived'].includes(s)) return 'left'
  return 'bad'
}

/** "Angharad Smith" or "Smith, Angharad" → ["Angharad", "Smith"] */
function splitName(full: string): [string, string] {
  const comma = full.indexOf(',')
  if (comma > 0) return [full.slice(comma + 1).trim(), full.slice(0, comma).trim()]
  const parts = full.trim().split(/\s+/)
  return [parts[0] ?? '', parts.slice(1).join(' ')]
}

// ---- Rows → students ----------------------------------------------------------------------------
export type ImportStudent = {
  first_name: string
  last_name: string
  date_of_birth: string | null
  is_minor: boolean
  email: string
  phone: string
  address: string
  instruments: string[]
  level: string
  status: 'active' | 'paused' | 'left'
  start_date: string | null
  notes: string
}
export type ImportParent = { first_name: string; last_name: string; email: string; phone: string; relationship: string }
export type ImportRow = {
  line: number // line in the file (1 = headings)
  name: string
  student: ImportStudent | null
  parent: ImportParent | null
  problem: string | null // set when the row can't be added
}
export type ImportResult = { rows: ImportRow[]; unknownHeadings: string[]; error: string | null }

export function readImport(text: string): ImportResult {
  const all = parseCsv(text)
  if (all.length < 2) return { rows: [], unknownHeadings: [], error: 'That file has no students in it — it needs a row of headings, then one student per row.' }
  const [headings, ...data] = all
  if (data.length > MAX_IMPORT_ROWS) return { rows: [], unknownHeadings: [], error: `That’s ${data.length} rows — please import ${MAX_IMPORT_ROWS} or fewer at a time.` }
  const cols = mapHeadings(headings)
  if (!cols.includes('first_name') && !cols.includes('full_name'))
    return { rows: [], unknownHeadings: [], error: 'We couldn’t find a “First name” (or “Name”) column. Check the first row of the file has headings — or start from the template.' }
  const unknownHeadings = headings.filter((h, i) => cols[i] === null && h.trim() !== '')

  const rows = data.map((cells, i): ImportRow => {
    const get = (c: Column) => {
      const idx = cols.indexOf(c)
      return idx === -1 ? '' : (cells[idx] ?? '').trim()
    }
    let first = get('first_name')
    let last = get('last_name')
    if (!first && get('full_name')) [first, last] = splitName(get('full_name'))
    const name = [first, last].filter(Boolean).join(' ') || '(no name)'
    const fail = (problem: string): ImportRow => ({ line: i + 2, name, student: null, parent: null, problem })

    if (!first) return fail('No first name.')
    const dob = readDate(get('date_of_birth'))
    if (dob === 'bad') return fail(`Date of birth “${get('date_of_birth')}” isn’t a date we can read — use 21/03/2014.`)
    const age = ageFrom(dob)
    if (age !== null && (age < 0 || age > 120)) return fail('Date of birth looks wrong.')
    const start = readDate(get('start_date'))
    if (start === 'bad') return fail(`Start date “${get('start_date')}” isn’t a date we can read — use 01/09/2026.`)
    const status = readStatus(get('status'))
    if (status === 'bad') return fail(`Status “${get('status')}” should be Active, Paused or Past.`)
    const email = get('email').toLowerCase()
    if (email && !EMAIL_RE.test(email)) return fail(`“${email}” doesn’t look like an email address.`)

    // Child or adult: date of birth decides; otherwise the Adult column; otherwise
    // a row with a parent is a child and one without is an adult
    let pFirst = get('parent_first_name')
    let pLast = get('parent_last_name')
    if (!pFirst && get('parent_name')) [pFirst, pLast] = splitName(get('parent_name'))
    const pEmail = get('parent_email').toLowerCase()
    const pPhone = get('parent_phone')
    const hasParent = Boolean(pFirst || pLast || pEmail || pPhone)
    const is_minor = age !== null ? age < 18 : get('adult') ? !yes(get('adult')) : hasParent

    let parent: ImportParent | null = null
    if (is_minor) {
      if (!hasParent) return fail('Under 18 but no parent or guardian — add one (reminders and invoices for children go to them), or put Yes in the Adult column.')
      if (!pFirst) return fail('The parent or guardian needs a first name.')
      if (!pEmail && !pPhone) return fail(`Add an email or phone number for ${pFirst}.`)
      if (pEmail && !EMAIL_RE.test(pEmail)) return fail(`Parent email “${pEmail}” doesn’t look like an email address.`)
      parent = { first_name: pFirst, last_name: pLast, email: pEmail, phone: pPhone, relationship: get('relationship') }
    }

    return {
      line: i + 2,
      name,
      problem: null,
      parent,
      student: {
        first_name: first,
        last_name: last,
        date_of_birth: dob,
        is_minor,
        email,
        phone: get('phone'),
        address: get('address'),
        instruments: splitList(get('instruments')),
        level: get('level'),
        status,
        start_date: start,
        notes: get('notes'),
      },
    }
  })
  return { rows, unknownHeadings, error: null }
}

/** The template as CSV text. */
export function templateCsv(): string {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return [TEMPLATE_HEADINGS, ...TEMPLATE_EXAMPLES].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n'
}
