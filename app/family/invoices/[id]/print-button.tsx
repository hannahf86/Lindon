'use client'
// =============================================================================
// family/invoices/[id]/print-button.tsx — opens the browser's print dialog
// (where "Save as PDF" lives). Hidden from the printout itself.
// =============================================================================

export function PrintButton() {
  return (
    <button type="button" className="btn no-print" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  )
}
