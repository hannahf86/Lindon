// =============================================================================
// app/(site)/layout.tsx — the public website: header + page + footer
//
// Pages: /home (what signed-out visitors see at "/" — proxy.ts rewrites it)
// and /contact. Header: logo, Contact, Sign in, and "Request an account"
// (Lindon is invite-only for now). Signed-in visitors get "Open Lindon"
// instead. Footer: policies and contact.
// =============================================================================
import Link from 'next/link'
import { auth } from '@/auth'
import { LogoMark } from '@/components/logo'
import { POLICIES } from '@/lib/policies'

export default async function SiteLayout({ children }: LayoutProps<'/'>) {
  const session = await auth()
  const signedIn = Boolean(session?.user)

  return (
    <div className="site">
      {/* ---- Header ---- */}
      <header className="site-head">
        <div className="site-wrap site-head-inner">
          <Link href="/" className="site-brand">
            <LogoMark size={38} />
            Lindon
          </Link>
          <nav className="site-nav" aria-label="Website">
            <Link href="/home#features" className="site-hide-sm">
              Features
            </Link>
            <Link href="/contact">Contact</Link>
            {signedIn ? (
              <Link href="/" className="btn btn-sm">
                Open Lindon
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-secondary btn-sm">
                  Sign in
                </Link>
                <Link href="/signup" className="btn btn-sm site-hide-sm">
                  Request an account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      {/* ---- Footer ---- */}
      <footer className="site-foot">
        <div className="site-wrap site-foot-inner">
          <div>
            <div className="site-brand site-brand-sm">
              <LogoMark size={28} />
              Lindon
            </div>
            <p className="small">Lessons, reminders and invoices for instrumental music teachers. Made in York.</p>
          </div>
          <nav className="site-foot-links" aria-label="Policies and contact">
            <Link href="/contact">Contact &amp; feedback</Link>
            {POLICIES.map((p) => (
              <Link key={p.href} href={p.href}>
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="site-wrap small site-copy">© {new Date().getFullYear()} Jorvik Web Dev</div>
      </footer>
    </div>
  )
}
