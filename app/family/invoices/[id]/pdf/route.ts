// =============================================================================
// family/invoices/[id]/pdf/route.ts — a family downloads the PDF of one of
// THEIR invoices (sent or paid, for one of their own pupils only).
// =============================================================================
import { db } from '@/lib/db'
import { requireFamily } from '@/lib/family'
import { invoicePdf } from '@/lib/invoice-pdf'
import type { Invoice, Teacher } from '@/lib/database.types'

export async function GET(_req: Request, ctx: RouteContext<'/family/invoices/[id]/pdf'>) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 })
  const family = await requireFamily()
  for (const link of family.links) {
    if (!link.studentIds.length) continue
    const { data: inv } = await db()
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('teacher_id', link.teacher.id)
      .in('student_id', link.studentIds)
      .in('status', ['sent', 'paid'])
      .maybeSingle()
    if (!inv) continue
    const { data: teacher } = await db().from('teachers').select('*').eq('id', link.teacher.id).single()
    if (!teacher) break
    const bytes = await invoicePdf(teacher as Teacher, inv as Invoice)
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Invoice ${inv.number}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }
  return new Response('Not found', { status: 404 })
}
