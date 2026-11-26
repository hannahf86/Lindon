// =============================================================================
// invoices/[id]/pdf/route.ts — download the branded PDF of one invoice
// (teacher side; only their own invoices). lib/invoice-pdf.ts draws it.
// =============================================================================
import { requireTeacher } from '@/lib/db'
import { invoiceForPdf, invoicePdf } from '@/lib/invoice-pdf'

export async function GET(_req: Request, ctx: RouteContext<'/invoices/[id]/pdf'>) {
  const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 })
  const teacher = await requireTeacher()
  const inv = await invoiceForPdf(teacher.id, id)
  if (!inv) return new Response('Not found', { status: 404 })
  const bytes = await invoicePdf(teacher, inv)
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Invoice ${inv.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
