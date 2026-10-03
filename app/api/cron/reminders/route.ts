// =============================================================================
// app/api/cron/reminders/route.ts — hourly lesson-reminder job (Vercel Cron)
//
// Vercel Cron calls this with "Authorization: Bearer <CRON_SECRET>". Anything
// else gets a 401. proxy.ts leaves /api/cron public so the sign-in check
// doesn't get in the way; this secret is the only gate.
// =============================================================================
import { sendDueReminders } from '@/lib/reminders'

export async function GET(request: Request) {
  // ---- Auth: shared secret -------------------------------------------------------------
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ---- Run ---------------------------------------------------------------------------
  const summary = await sendDueReminders()
  return Response.json({ ok: true, ranAt: new Date().toISOString(), ...summary })
}
