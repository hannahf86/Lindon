// =============================================================================
// lib/features.ts — the optional parts of Lindon each teacher can switch on/off
//
// Scheduling, students and invoicing are always on. Everything here is chosen
// during onboarding and can be changed later in Settings → Features.
// How a teacher charges (in advance with make-up credits, or in arrears) is a
// separate setting: teacher.billing_mode.
// Pure helpers, so server and client components can both use them.
// =============================================================================
import type { BillingMode } from './database.types'

export const FEATURES = [
  {
    key: 'family_logins',
    label: 'Family logins',
    description: 'Parents and adult pupils can sign in to see their upcoming lessons and invoices.',
  },
  {
    key: 'messaging',
    label: 'In-app messages',
    description: 'Message families inside Lindon, with an email alert for each new message. Needs family logins.',
    needs: 'family_logins',
  },
  {
    key: 'sheets',
    label: 'Music & files for families',
    description: 'Share sheet music, scans and backing tracks with families, for everyone or chosen pupils. Needs family logins.',
    needs: 'family_logins',
  },
  {
    key: 'exams',
    label: 'Exams',
    description: 'Exam dates, entry deadlines and exam fees on invoices.',
  },
  {
    key: 'library',
    label: 'Library, loans & hire',
    description: 'Track books and instruments you lend, with optional monthly hire fees on invoices.',
  },
  {
    key: 'equipment',
    label: 'Invoice items',
    description: 'A list of things you charge for besides lessons — strings, books, accessories — with the price you set, ready to add to any invoice.',
  },
  {
    key: 'reports',
    label: 'Income reports',
    description: 'Income by month and tax year, with a spreadsheet export for your tax return.',
  },
  {
    key: 'daily_tip',
    label: 'Tip of the day',
    description: 'A short practice tip at the top of your dashboard, different each day.',
  },
  {
    key: 'daily_quote',
    label: 'Funny quote of the day',
    description: 'A light-hearted quote about teaching music at the top of your dashboard. Families never see it.',
  },
] as const

export type FeatureKey = (typeof FEATURES)[number]['key']
export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[]

type HasFeatures = { features: string[] }

/** Is this feature switched on (and anything it depends on)? */
export function has(t: HasFeatures, key: FeatureKey): boolean {
  if (!t.features.includes(key)) return false
  const f = FEATURES.find((x) => x.key === key)
  return !(f && 'needs' in f) || t.features.includes(f.needs)
}

/** Make-up credits only exist for teachers who bill in advance. */
export function usesCredits(t: { billing_mode: BillingMode }): boolean {
  return t.billing_mode === 'advance'
}

export const BILLING_OPTIONS = [
  { value: 'advance', label: 'In advance' },
  { value: 'arrears', label: 'In arrears' },
] as const

export const BILLING_TEXT: Record<BillingMode, string> = {
  advance:
    'Invoices go out on the 1st for the month ahead. When a pupil gives notice or you cancel, they get a make-up credit that comes off their next invoice.',
  arrears:
    'Invoices go out on the 1st for last month’s lessons. Lessons cancelled with notice, or by you, simply aren’t charged — no credits needed.',
}
