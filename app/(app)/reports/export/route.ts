// =============================================================================
// reports/export/route.ts — CSV download of income for a period
// GET /reports/export?from=YYYY-MM-DD&to=YYYY-MM-DD
// One row per line on every invoice paid in the period (for your accountant
// or a Self Assessment spreadsheet). Scoped to the signed-in teacher.
// =============================================================================
import type { NextRequest } from 'next/server'

import { todayISO } from '@/lib/dates'
import { linesToCsv, paidLines, resolvePeriod } from '@/lib/reports'
import { requireFeature } from '@/lib/require-feature'

export async function GET(request: NextRequest) {
  // requireFeature('reports') redirects to /login when signed out
  const teacher = await requireFeature('reports')
  const sp = Object.fromEntries(request.nextUrl.searchParams.entries())
  const period = resolvePeriod(sp, todayISO(teacher.timezone))

  const csv = linesToCsv(await paidLines(teacher.id, period))

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="income-${period.from}-to-${period.to}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
