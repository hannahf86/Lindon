// =============================================================================
// library/helpers.ts — small display helpers for the library and exams pages
// (loan state of an item, the currency symbol shown inside money boxes).
// =============================================================================
import type { Loan } from '@/lib/database.types'

export { currencySymbol } from '@/lib/format'

export type LoanState = 'available' | 'on_loan' | 'overdue'

/** Where an item is right now, given its open loan (if any). */
export function loanState(open: Pick<Loan, 'due_on'> | null | undefined, today: string): LoanState {
  if (!open) return 'available'
  return open.due_on && open.due_on < today ? 'overdue' : 'on_loan'
}
