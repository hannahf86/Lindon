// =============================================================================
// app/api/cron/reminders/route.ts — the hourly job (Vercel Cron)
//
// 1. Lesson reminders due in each teacher's reminder window.
// 2. On the 1st of the month, each teacher's monthly invoices (lib/auto-invoices).
// 2a. Overdue invoice reminders for auto-invoicing teachers (lib/invoice-reminders).
// 2b. Exam reminders (lib/exam-reminders), from 9am in each teacher's timezone.
// 3. Once a day (02:00 UTC run), lessons for bookings with no end date are
//    topped up to six months ahead (lib/bookings).
//
// Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>". Anything
// else gets a 401. proxy.ts leaves /api/cron public so the sign-in check
// doesn't get in the way; this secret is the only gate.
// =============================================================================
import { sendDueReminders } from '@/lib/reminders'
import { runAutoInvoices } from '@/lib/auto-invoices'
import { extendOpenBookings } from '@/lib/bookings'
import { sendDueExamReminders } from '@/lib/exam-reminders'
import { sendOverdueInvoiceReminders } from '@/lib/invoice-reminders'

export async function GET(request: Request) {
  // ---- Auth: shared secret -------------------------------------------------------------
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ---- Run ---------------------------------------------------------------------------
  const reminders = await sendDueReminders()
  const invoices = await runAutoInvoices()
  // Never let these stop the rest of the hourly job
  const invoiceReminders = await sendOverdueInvoiceReminders().catch((e: Error) => ({ error: e.message }))
  const examReminders = await sendDueExamReminders().catch((e: Error) => ({ error: e.message }))
  const openBookings = new Date().getUTCHours() === 2 ? await extendOpenBookings() : null
  return Response.json({ ok: true, ranAt: new Date().toISOString(), reminders, invoiceReminders, examReminders, invoices, openBookings })
}
