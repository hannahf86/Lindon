// =============================================================================
// app/api/calendar/[token]/route.ts — the private calendar feed (.ics)
//
// Google / Apple / Outlook calendars fetch this URL on their own schedule.
// No sign-in (calendar apps can't sign in), so the long random token IS the
// key: an unknown token gets a 404. proxy.ts leaves /api/calendar public.
// Accepts an optional ".ics" on the end, which some calendar apps like.
// =============================================================================
import { db } from '@/lib/db'
import { buildCalendarFeed } from '@/lib/calendar-feed'
import type { Teacher } from '@/lib/database.types'

export async function GET(_req: Request, ctx: RouteContext<'/api/calendar/[token]'>) {
  const { token: raw } = await ctx.params
  const token = raw.replace(/\.ics$/, '')
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return new Response('Not found', { status: 404 })

  const { data: teacher } = await db().from('teachers').select('*').eq('calendar_token', token).maybeSingle()
  if (!teacher) return new Response('Not found', { status: 404 })

  const body = await buildCalendarFeed(teacher as Teacher)
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="lindon-lessons.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
