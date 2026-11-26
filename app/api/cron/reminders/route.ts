// =============================================================================
// app/api/cron/reminders/route.ts — the hourly job (Vercel Cron)
//
// 1. Lesson reminders due in each teacher's reminder window.
// 2. On the 1st of the month, each teacher's monthly invoices (lib/auto-invoices).
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

export async function GET(request: Request) {
  // ---- Auth: shared secret -------------------------------------------------------------
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ---- Run ---------------------------------------------------------------------------
  const reminders = await sendDueReminders()
  const invoices = await runAutoInvoices()
  const openBookings = new Date().getUTCHours() === 2 ? await extendOpenBookings() : null
  return Response.json({ ok: true, ranAt: new Date().toISOString(), reminders, invoices, openBookings })
}
