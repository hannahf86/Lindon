// =============================================================================
// proxy.ts — optimistic sign-in check (Next 16's renamed "middleware")
//
// Bounces signed-out visitors to /login before a page renders. This is only
// the first line of defence: every page and server action still calls
// requireTeacher(), which is the real authorisation check.
// =============================================================================
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { CANONICAL_HOST } from '@/lib/site'

// /api/calendar: calendar apps can't sign in; the long random token in the URL is the key
// /join: the family welcome page — the token in the emailed link is the key
// /policies: privacy, safeguarding and terms pages anyone can read
// /manifest.webmanifest: the install-as-an-app details (browsers fetch it without cookies)
// /home, /contact: the public website (signed-out visitors to / see /home)
const PUBLIC_PATHS = ['/home', '/contact', '/manifest.webmanifest', '/login', '/signup', '/join', '/policies', '/api/auth', '/api/cron', '/api/calendar']

export default auth((req) => {
  const { pathname } = req.nextUrl
  // One main address: lindon-ten.vercel.app → lindonmusic.co.uk (when CANONICAL_HOST
  // is set). /api is left alone so calendar subscriptions, the cron job and
  // sign-in callbacks on the old address keep working.
  const host = (req.headers.get('host') ?? '').toLowerCase()
  if (CANONICAL_HOST && host && host !== CANONICAL_HOST && host.endsWith('.vercel.app') && !pathname.startsWith('/api/')) {
    const url = new URL(req.nextUrl.pathname + req.nextUrl.search, `https://${CANONICAL_HOST}`)
    return NextResponse.redirect(url, 308)
  }
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
  // Signed out at the front door: show the website (the address stays "/")
  if (!req.auth && pathname === '/') return NextResponse.rewrite(new URL('/home', req.nextUrl.origin))
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
