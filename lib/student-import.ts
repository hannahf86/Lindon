// =============================================================================
// lib/student-import.ts — turn a CSV file into students (and their parents)
//
// Used by Students → Import from CSV. Pure functions, no database:
//   parseCsv(text)        CSV text → rows of cells (quotes, commas inside
//                         quotes, CRLF, a UTF-8 BOM, ; separators from Excel)
//   readImport(text)      rows → students checked one by one. Everything that
//                         can be imported is: unreadable dates are left blank,
//                         unknown statuses become Active, and anything without a
//                         place in Lindon (extra columns, bad emails, parents with
//                         no contact details) is kept in the pupil's notes
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
  date_of_birth: ['date of birth', 'dob', 'd o b', 'birthday', 'birth date', 'birthdate', 'born', 'date born', 'student birthday', 'student dob'],
  // Adult or child: a yes/no column either way round, a "type" column with
  // words in it, an age, or a school year group
  adult: ['adult', 'adult pupil', 'adult student', 'is adult', 'over 18', 'over 18s', '18 or over', 'adult learner'],
  child: ['child', 'minor', 'is child', 'is minor', 'under 18', 'under 18s', 'junior', 'child pupil', 'child student'],
  type: ['student type', 'pupil type', 'type', 'age group', 'adult or child', 'child or adult', 'category', 'student category', 'lesson category', 'group', 'group tags', 'tags', 'age category'],
  age: ['age', 'current age', 'age now', 'student age', 'pupil age'],
  year_group: ['year group', 'school year', 'year', 'school year group', 'class', 'school class'],
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
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/**
 * Read a date the way people (and other systems) write them → 2014-03-21.
 *   2014-03-21 · 21/03/2014 · 21-03-14 · 21.03.2014   (UK order: day first)
 *   03/21/2014                                        (US order, when the day can't be a month)
 *   21 March 2014 · 21st Mar 2014 · March 21, 2014 · Mar 2014 (→ the 1st)
 *   41720                                             (Excel's number for a date)
 * null if blank, 'bad' if unreadable.
 */
export function readDate(v: string): string | null | 'bad' {
  const s = v.trim().replace(/\s+/g, ' ')
  if (!s) return null
  let y = 0,
    m = 0,
    d = 1
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  const num = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:\s.*)?$/)
  const dayMonth = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[ \-]([a-z]+)\.?,?[ \-](\d{2}|\d{4})$/i)
  const monthDay = s.match(/^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/i)
  const monthYear = s.match(/^([a-z]+)\.? (\d{4})$/i)
  const month = (w: string) => MONTHS.indexOf(w.slice(0, 3).toLowerCase()) + 1
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (num) {
    let [a, b] = [Number(num[1]), Number(num[2])]
    if (b > 12 && a <= 12) [a, b] = [b, a] // US order: month first
    ;[d, m, y] = [a, b, Number(num[3])]
  } else if (dayMonth) [d, m, y] = [Number(dayMonth[1]), month(dayMonth[2]), Number(dayMonth[3])]
  else if (monthDay) [m, d, y] = [month(monthDay[1]), Number(monthDay[2]), Number(monthDay[3])]
  else if (monthYear) [m, y] = [month(monthYear[1]), Number(monthYear[2])]
  else if (/^\d{4,5}(\.0+)?$/.test(s) && Number(s) > 3000 && Number(s) < 80000) {
    // Excel stores dates as days since 30 Dec 1899
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(s)) * 86400000)
    ;[y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]
  } else return 'bad'
  if (y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000
  if (!m) return 'bad'
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return 'bad'
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const YES = /^(y|yes|true|1|x|✓|✔)$/i
const NO = /^(n|no|false|0)$/i

/** Words that say adult or child: "Adult", "Children's lessons", "Under 18", "Junior"… */
function ageWords(v: string): 'adult' | 'child' | null {
  const s = v.toLowerCase()
  if (/\b(adults?|grown ?ups?|over ?18s?|18 ?\+|18 or over|mature)\b/.test(s)) return 'adult'
  if (/\b(child|children|childrens|kids?|junior|juniors|minors?|under ?18s?|teens?|teenagers?|youth|young|primary|secondary|pupil premium)\b/.test(s)) return 'child'
  return null
}

/** "Year 7", "Y10", "Reception", "Nursery", "7" (in a year-group column) → a child */
function isSchoolYear(v: string): boolean {
  const s = v.trim().toLowerCase()
  return /^(reception|nursery|pre ?school|foundation|eyfs|ks[1-4])$/.test(s) || /^(y|yr|year|p|s)? ?([1-9]|1[0-3])$/.test(s)
}

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
  warnings: string[] // added, but something wasn't quite right (shown on the check screen)
  basis: string // how we decided adult or child, e.g. "age 12", "Student type: Adult"
  problem: string | null // set when the row can't be added (no name)
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

  // Import what we can: only a row with no name is left out. Anything that
  // can't go in its proper place is kept in the pupil's notes, and the check
  // screen says what happened ("warnings").
  const rows = data.map((cells, i): ImportRow => {
    const cell = (idx: number) => (idx === -1 ? '' : (cells[idx] ?? '').trim())
    const get = (c: StudentCol) => cell(mapped.findIndex((m) => m?.kind === 'student' && m.col === c))
    const getP = (n: number, f: ParentField) => cell(mapped.findIndex((m) => m?.kind === 'parent' && m.n === n && m.field === f))
    const warnings: string[] = []
    const kept: string[] = [] // "Heading: value" lines for the notes

    let first = get('first_name')
    let last = get('last_name')
    if (!first && get('full_name')) [first, last] = splitName(get('full_name'))
    const name = [first, last].filter(Boolean).join(' ') || '(no name)'
    if (!first) return { line: i + 2, name, student: null, parents: [], warnings, basis: '', problem: 'No name — left out.' }

    // ---- Dates, status and email: unreadable → left blank, kept in notes ----
    let dob = readDate(get('date_of_birth'))
    if (dob === 'bad') {
      warnings.push('date of birth unreadable, left blank')
      kept.push(`Date of birth: ${get('date_of_birth')}`)
      dob = null
    }
    let age = ageFrom(dob)
    if (age !== null && (age < 0 || age > 120)) {
      warnings.push('date of birth looked wrong, left blank')
      kept.push(`Date of birth: ${get('date_of_birth')}`)
      dob = null
      age = null
    }
    let start = readDate(get('start_date'))
    if (start === 'bad') {
      warnings.push('start date unreadable, left blank')
      kept.push(`Start date: ${get('start_date')}`)
      start = null
    }
    let status = readStatus(get('status'))
    if (status === 'bad') {
      warnings.push(`status “${get('status')}” added as Active`)
      kept.push(`Status: ${get('status')}`)
      status = 'active'
    }
    let email = get('email').toLowerCase()
    if (email && !EMAIL_RE.test(email)) {
      warnings.push('email didn’t look right, kept in notes')
      kept.push(`Email: ${get('email')}`)
      email = ''
    }

    // ---- Parents (parent 1, parent 2 …) ----
    const parents: ImportParent[] = []
    for (const n of parentNumbers) {
      let pFirst = getP(n, 'first_name')
      let pLast = getP(n, 'last_name')
      // A single name column; "Smith, Ann; Smith, Rob" lists two people — take the first
      if (!pFirst && !pLast && getP(n, 'name')) [pFirst, pLast] = splitName(getP(n, 'name').split(';')[0])
      let pEmail = getP(n, 'email').toLowerCase()
      const pPhone = getP(n, 'mobile') || getP(n, 'phone') || getP(n, 'work_phone')
      if (!pFirst && !pLast && !pEmail && !pPhone) continue
      if (pEmail && !EMAIL_RE.test(pEmail)) {
        warnings.push('a parent email didn’t look right, kept in notes')
        kept.push(`Parent email: ${getP(n, 'email')}`)
        pEmail = ''
      }
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
    // Parents we can reach are linked; a name with no email or phone goes in the notes
    const reachable = parents.filter((p) => p.email || p.phone)
    for (const p of parents.filter((x) => !x.email && !x.phone)) kept.push(`Parent: ${[p.first_name, p.last_name].filter(Boolean).join(' ')} (no email or phone in the file)`)

    // ---- Child or adult, from the best clue in the row (and say which) ----
    const { is_minor, basis } = childOrAdult({
      age,
      ageCol: get('age'),
      adultCol: get('adult'),
      childCol: get('child'),
      typeCol: get('type'),
      yearCol: get('year_group'),
      hasParent: parents.length > 0,
    })
    if (is_minor && reachable.length === 0) warnings.push('needs a parent’s email or phone before reminders and invoices can go out')
    if (!is_minor && reachable.length) for (const p of reachable) kept.push(`Contact: ${[p.first_name, p.last_name].filter(Boolean).join(' ')} ${[p.email, p.phone].filter(Boolean).join(' ')}`.trim())

    // ---- Columns Lindon has no place for → notes ----
    // (type/tags and year-group columns are kept too: they're only used as clues)
    headings.forEach((h, idx) => {
      const m = mapped[idx]
      const clueOnly = m?.kind === 'student' && (m.col === 'type' || m.col === 'year_group' || m.col === 'age')
      if ((m === null || clueOnly) && cell(idx)) kept.push(`${h.trim()}: ${cell(idx)}`)
    })

    const notes = [get('notes'), kept.length ? `From your import:\n${kept.join('\n')}` : ''].filter(Boolean).join('\n\n')
    return {
      line: i + 2,
      name,
      problem: null,
      basis,
      warnings,
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
        notes,
      },
    }
  })
  return { rows, unknownHeadings, error: null }
}

// ---- Adult or child ---------------------------------------------------------------------------
/**
 * Decide adult or child from the best clue, in this order:
 *   1. date of birth  2. an Age column  3. an Adult or Child yes/no column
 *   4. words in a type/category/tags column ("Adult", "Children's lessons")
 *   5. a school year group ("Year 7", "Reception")
 *   6. otherwise: a parent listed → child; no parent → adult
 */
function childOrAdult(c: { age: number | null; ageCol: string; adultCol: string; childCol: string; typeCol: string; yearCol: string; hasParent: boolean }): { is_minor: boolean; basis: string } {
  if (c.age !== null) return { is_minor: c.age < 18, basis: `age ${c.age}` }
  const ageNum = c.ageCol.match(/^(\d{1,3})/)
  if (ageNum && Number(ageNum[1]) <= 120) return { is_minor: Number(ageNum[1]) < 18, basis: `age ${Number(ageNum[1])}` }
  if (c.adultCol) {
    if (YES.test(c.adultCol)) return { is_minor: false, basis: 'Adult column' }
    if (NO.test(c.adultCol)) return { is_minor: true, basis: 'Adult column' }
    const w = ageWords(c.adultCol)
    if (w) return { is_minor: w === 'child', basis: `Adult column: ${c.adultCol}` }
  }
  if (c.childCol) {
    if (YES.test(c.childCol)) return { is_minor: true, basis: 'Child column' }
    if (NO.test(c.childCol)) return { is_minor: false, basis: 'Child column' }
    const w = ageWords(c.childCol)
    if (w) return { is_minor: w === 'child', basis: `Child column: ${c.childCol}` }
  }
  const w = c.typeCol ? ageWords(c.typeCol) : null
  if (w) return { is_minor: w === 'child', basis: `“${c.typeCol.length > 30 ? c.typeCol.slice(0, 30) + '…' : c.typeCol}”` }
  if (c.yearCol && isSchoolYear(c.yearCol)) return { is_minor: true, basis: `school year ${c.yearCol}` }
  return c.hasParent ? { is_minor: true, basis: 'has a parent listed' } : { is_minor: false, basis: 'no parent listed' }
}

/** The template as CSV text. */
export function templateCsv(): string {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return [TEMPLATE_HEADINGS, ...TEMPLATE_EXAMPLES].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n'
}
