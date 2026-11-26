// =============================================================================
// proxy.ts — optimistic sign-in check (Next 16's renamed "middleware")
//
// Bounces signed-out visitors to /login before a page renders. This is only
// the first line of defence: every page and server action still calls
// requireTeacher(), which is the real authorisation check.
// =============================================================================
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

// /api/calendar: calendar apps can't sign in; the long random token in the URL is the key
// /join: the family welcome page — the token in the emailed link is the key
const PUBLIC_PATHS = ['/login', '/signup', '/join', '/api/auth', '/api/cron', '/api/calendar']

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  if (!req.auth && !isPublic) {
    const url = new URL('/login', req.nextUrl.origin)
    if (pathname !== '/') url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }
})

export const config = {
  // Everything except static assets and image optimisation
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|webp|ico)$).*)'],
}
