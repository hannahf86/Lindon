// =============================================================================
// proxy.ts — optimistic sign-in check (Next 16's renamed "middleware")
//
// Bounces signed-out visitors to /login before a page renders. This is only
// the first line of defence: every page and server action still calls
// requireTeacher(), which is the real authorisation check.
// =============================================================================
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/cron']

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
