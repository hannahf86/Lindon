'use server'
// =============================================================================
// family/invoices/actions.ts — "I've paid" from the family side
//
// Only for a SENT invoice belonging to one of the family's own pupils. It
// doesn't mark the invoice paid — it records that the family says so (and
// their note) and emails the teacher, who confirms with "Mark paid".
// =============================================================================
import { revalidatePath } from 'next/cache'
import { db, must } from '@/lib/db'
import { requireFamily } from '@/lib/family'
import { handle, str, FormError, type ActionState } from '@/lib/forms'
import { fmtDate } from '@/lib/dates'
import { money } from '@/lib/format'
import { sendEmail } from '@/lib/email'
import { detailTable, esc, layout, paragraphs } from '@/lib/email-templates'
import { appUrl } from '@/lib/app-url'
import type { Teacher } from '@/lib/database.types'

export async function familySaysPaid(invoiceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const ctx = await requireFamily()
    if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) throw new FormError('That invoice couldn’t be found.')
    // Find it under one of their own links (teacher + their pupils)
    let found: { id: string; number: string; total: number; teacher_id: string; status: string; family_paid_at: string | null } | null = null
    for (const link of ctx.links) {
      if (!link.studentIds.length) continue
      const { data } = await db()
        .from('invoices')
        .select('id, number, total, teacher_id, status, family_paid_at')
        .eq('id', invoiceId)
        .eq('teacher_id', link.teacher.id)
        .in('student_id', link.studentIds)
        .maybeSingle()
      if (data) found = data
    }
    if (!found) throw new FormError('That invoice couldn’t be found.')
    if (found.status === 'paid') return { ok: 'This invoice is already marked as paid — thank you!' }
    if (found.status !== 'sent') throw new FormError('This invoice can’t be paid at the moment.')
    if (found.family_paid_at) return { ok: 'You’ve already told your teacher — thank you!' }

    const note = str(fd, 'note').slice(0, 500)
    must(await db().from('invoices').update({ family_paid_at: new Date().toISOString(), family_paid_note: note }).eq('id', found.id).eq('teacher_id', found.teacher_id).select('id'))

    // ---- Tell the teacher ----
    const teacher = must(await db().from('teachers').select('*').eq('id', found.teacher_id).single()) as Teacher
    if (teacher.email) {
      const who = ctx.name || ctx.email
      const rows: [string, string][] = [
        ['Invoice', found.number],
        ['Amount', money(found.total, teacher.currency)],
        ['From', who],
        ['Said paid on', fmtDate(new Date().toISOString().slice(0, 10), 'd MMMM yyyy')],
      ]
      await sendEmail({
        teacher,
        to: [teacher.email],
        kind: 'individual',
        invoiceId: found.id,
        email: {
          subject: `${who} says invoice ${found.number} is paid`,
          text: `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}${note ? `\n\nTheir note: ${note}` : ''}\n\nCheck your account, then mark it paid: ${appUrl(`/invoices/${found.id}`)}`,
          html: layout({
            studio: teacher.business_name || teacher.display_name || 'Lindon',
            heading: 'A family says they’ve paid',
            bodyHtml:
              detailTable(rows) +
              (note ? `<div style="background:#EEF7F7;border-radius:14px;padding:14px 16px;margin:0 0 14px"><strong>Their note</strong>${paragraphs(note)}</div>` : '') +
              `<p style="margin:0">Check it’s arrived, then <a href="${esc(appUrl(`/invoices/${found.id}`))}">mark the invoice paid</a>.</p>`,
          }),
        },
      })
    }
    revalidatePath('/family', 'layout')
    revalidatePath('/invoices', 'layout')
    revalidatePath('/')
    return { ok: 'Thanks! Your teacher has been told and will confirm once it’s arrived.' }
  })
}
