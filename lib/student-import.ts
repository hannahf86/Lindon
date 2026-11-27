// =============================================================================
// lib/student-import.ts — turn a CSV file into students (and their parents)
//
// Used by Students → Import from CSV. Pure functions, no database:
//   parseCsv(text)        CSV text → rows of cells (quotes, commas inside
//                         quotes, CRLF, a UTF-8 BOM, ; separators from Excel)
//   readImport(text)      rows → students checked one by one: each comes back
//                         either ready to add or with the reason it can't be
// Column headings are matched loosely ("First name", "first_name", "Forename"
// all work), so exports from other systems mostly just work — including
// numbered parent contacts like My Music Staff's "Parent Contact 1 Email",
// "Parent Contact 2 Mobile Phone". Dates can be 2014-03-21 or 21/03/2014.
// =============================================================================
import { ageFrom, splitList } from './format'

export const MAX_IMPORT_ROWS = 500
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ---- Pupil columns, and the headings that mean them ------------------------------------------
// Phones: a mobile is used first, then a home phone, then a work phone.
const STUDENT_COLUMNS = {
  first_name: ['first name', 'firstname', 'forename', 'given name', 'student first name', 'pupil first name'],
  last_name: ['last name', 'lastname', 'surname', 'family name', 'student last name', 'student surname', 'pupil surname', 'pupil last name'],
  full_name: ['name', 'full name', 'student', 'student name', 'pupil', 'pupil name'],
  date_of_birth: ['date of birth', 'dob', 'birthday', 'birth date', 'birthdate'],
  adult: ['adult', 'adult pupil', 'is adult', 'over 18', 'student type', 'age group', 'adult or child'],
  email: ['email', 'e mail', 'student email', 'pupil email', 'email address'],
  mobile: ['mobile', 'mobile phone', 'cell', 'cell phone', 'student mobile', 'pupil mobile'],
  phone: ['phone', 'home phone', 'telephone', 'student phone', 'pupil phone', 'phone number'],
  work_phone: ['work phone'],
  address: ['address', 'home address', 'student address'],
  instruments: ['instrument', 'instruments', 'subject', 'subjects'],
  level: ['level', 'grade', 'standard', 'skill level'],
  status: ['status', 'student status'],
  start_date: ['start date', 'started', 'joined', 'student since', 'date joined'],
  notes: ['notes', 'note', 'comments', 'student notes'],
  relationship: ['relationship', 'parent relationship', 'relation'],
} as const
type StudentCol = keyof typeof STUDENT_COLUMNS

// ---- Parent columns: "Parent email", "Guardian 2 mobile", "Parent Contact 1 First Name" …
const PARENT_FIELDS = {
  first_name: ['first name', 'firstname', 'forename', 'given name'],
  last_name: ['last name', 'lastname', 'surname', 'family name'],
  name: ['', 'name', 'full name', 'names'],
  email: ['email', 'e mail', 'email address'],
  mobile: ['mobile', 'mobile phone', 'cell', 'cell phone'],
  phone: ['phone', 'home phone', 'telephone', 'phone number'],
  work_phone: ['work phone'],
  address: ['address'],
  notes: ['note', 'notes'],
  relationship: ['relationship', 'relation'],
} as const
type ParentField = keyof typeof PARENT_FIELDS
const PARENT_HEADING = /^(?:parent|guardian|carer|contact|family contact)s?(?: contact)?(?: (\d))?(?: (.*))?$/

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
    .replace(/[_\-./()#:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ---- Headings → what each column is --------------------------------------------------------
type Mapped = { kind: 'student'; col: StudentCol } | { kind: 'parent'; n: number; field: ParentField } | { kind: 'skip' } | null

function findIn<K extends string>(table: Record<K, readonly string[]>, s: string): K | null {
  for (const [key, names] of Object.entries(table) as [K, readonly string[]][]) if (names.includes(s) || s === norm(key)) return key
  return null
}

function mapHeadings(headings: string[]): Mapped[] {
  const taken = new Set<string>()
  return headings.map((h): Mapped => {
    const n = norm(h)
    if (!n) return null
    // Pupil column? (first heading of each kind wins)
    const col = findIn(STUDENT_COLUMNS, n)
    if (col && !taken.has(col)) {
      taken.add(col)
      return { kind: 'student', col }
    }
    // Parent column?
    const m = n.match(PARENT_HEADING)
    if (m) {
      const num = Number(m[1] ?? 1)
      const rest = (m[2] ?? '').trim()
      const field = findIn(PARENT_FIELDS, rest)
      if (field) {
        const key = `p${num}:${field}`
        if (taken.has(key)) return null
        taken.add(key)
        return { kind: 'parent', n: num, field }
      }
      // e.g. "Parent Contact 1 Home Texting Allowed" — understood, just not needed
      return { kind: 'skip' }
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
  if (!s || s === 'active' || s === 'current' || s === 'trial' || s === 'lead') return 'active'
  if (s === 'paused' || s === 'on hold' || s === 'waiting' || s === 'waiting list') return 'paused'
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
export type ImportParent = { first_name: string; last_name: string; email: string; phone: string; address: string; notes: string; relationship: string }
export type ImportRow = {
  line: number // line in the file (1 = headings)
  name: string
  student: ImportStudent | null
  parents: ImportParent[]
  problem: string | null // set when the row can't be added
}
export type ImportResult = { rows: ImportRow[]; unknownHeadings: string[]; error: string | null }

export function readImport(text: string): ImportResult {
  const all = parseCsv(text)
  if (all.length < 2) return { rows: [], unknownHeadings: [], error: 'That file has no students in it — it needs a row of headings, then one student per row.' }
  const [headings, ...data] = all
  if (data.length > MAX_IMPORT_ROWS) return { rows: [], unknownHeadings: [], error: `That’s ${data.length} rows — please import ${MAX_IMPORT_ROWS} or fewer at a time.` }
  const mapped = mapHeadings(headings)
  const has = (c: StudentCol) => mapped.some((m) => m?.kind === 'student' && m.col === c)
  if (!has('first_name') && !has('full_name'))
    return { rows: [], unknownHeadings: [], error: 'We couldn’t find a “First name” (or “Name”) column. Check the first row of the file has headings — or start from the template.' }
  const unknownHeadings = headings.filter((h, i) => mapped[i] === null && h.trim() !== '')
  const parentNumbers = [...new Set(mapped.flatMap((m) => (m?.kind === 'parent' ? [m.n] : [])))].sort()

  const rows = data.map((cells, i): ImportRow => {
    const cell = (idx: number) => (idx === -1 ? '' : (cells[idx] ?? '').trim())
    const get = (c: StudentCol) => cell(mapped.findIndex((m) => m?.kind === 'student' && m.col === c))
    const getP = (n: number, f: ParentField) => cell(mapped.findIndex((m) => m?.kind === 'parent' && m.n === n && m.field === f))

    let first = get('first_name')
    let last = get('last_name')
    if (!first && get('full_name')) [first, last] = splitName(get('full_name'))
    const name = [first, last].filter(Boolean).join(' ') || '(no name)'
    const fail = (problem: string): ImportRow => ({ line: i + 2, name, student: null, parents: [], problem })

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

    // ---- Parents (parent 1, parent 2 …) ----
    const parents: ImportParent[] = []
    for (const n of parentNumbers) {
      let pFirst = getP(n, 'first_name')
      let pLast = getP(n, 'last_name')
      // A single name column; "Smith, Ann; Smith, Rob" lists two people — take the first
      if (!pFirst && !pLast && getP(n, 'name')) [pFirst, pLast] = splitName(getP(n, 'name').split(';')[0])
      const pEmail = getP(n, 'email').toLowerCase()
      const pPhone = getP(n, 'mobile') || getP(n, 'phone') || getP(n, 'work_phone')
      if (!pFirst && !pLast && !pEmail && !pPhone) continue
      if (pEmail && !EMAIL_RE.test(pEmail)) return fail(`Parent email “${pEmail}” doesn’t look like an email address.`)
      parents.push({
        first_name: pFirst || pLast || 'Parent',
        last_name: pFirst ? pLast : '',
        email: pEmail,
        phone: pPhone,
        address: getP(n, 'address'),
        notes: getP(n, 'notes'),
        relationship: getP(n, 'relationship') || (n === parentNumbers[0] ? get('relationship') : ''),
      })
    }
    // Some systems keep the family's email/phone on the pupil row: if no parent
    // has contact details but the row does, they go to the first parent
    const rowPhone = get('mobile') || get('phone') || get('work_phone')
    if (parents.length && !parents.some((p) => p.email || p.phone) && (email || rowPhone)) {
      parents[0].email = email
      parents[0].phone = rowPhone
    }
    // Only parents we can actually reach are kept
    const reachable = parents.filter((p) => p.email || p.phone)

    // Child or adult: date of birth decides; otherwise an Adult / Student type
    // column; otherwise a pupil with a parent is a child and one without is an adult
    const is_minor = age !== null ? age < 18 : get('adult') ? !yes(get('adult')) : parents.length > 0

    if (is_minor && reachable.length === 0) {
      if (parents.length) return fail(`Add an email or phone number for ${parents[0].first_name}.`)
      return fail('Under 18 but no parent or guardian — add one (reminders and invoices for children go to them), or put Yes in the Adult column.')
    }

    return {
      line: i + 2,
      name,
      problem: null,
      parents: is_minor ? reachable : [],
      student: {
        first_name: first,
        last_name: last,
        date_of_birth: dob,
        is_minor,
        email,
        phone: rowPhone,
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
