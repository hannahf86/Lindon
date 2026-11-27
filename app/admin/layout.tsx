// =============================================================================
// app/admin/layout.tsx — the Lindon admin area (AUTH_ADMIN_EMAILS only)
//
// Sits outside the teacher app on purpose: an admin login doesn't need a
// studio, so there's no welcome steps and no sidebar — just a bar, the page
// and a sign-out button. Not an admin? A plain "this area is for admins"
// card that says who you're signed in as.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth, signOut } from '@/auth'
import { isAdmin } from '@/lib/access'
import { LogoMark } from '@/components/logo'
import { Card } from '@/components/ui'

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Lindon admin' } }

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const session = await auth()
  const email = session?.user?.email ?? ''
  if (!email) redirect('/login?callbackUrl=/admin')

  async function doSignOut() {
    'use server'
    await signOut({ redirectTo: '/login?callbackUrl=/admin' })
  }

  return (
    <div className="policy-shell">
      {/* ---- Bar ---- */}
      <header className="policy-bar">
        <Link href="/admin" className="policy-brand">
          <LogoMark size={34} />
          Lindon admin
        </Link>
        <nav className="policy-nav" aria-label="Admin">
          <Link href="/admin">Access requests</Link>
          <Link href="/admin/feedback">Feedback</Link>
        </nav>
        <form action={doSignOut} style={{ marginLeft: 'auto' }}>
          <span className="small" style={{ color: 'var(--sidebar-text-muted)', marginRight: 12 }}>
            {email}
          </span>
          <button type="submit" className="btn btn-secondary btn-sm">
            Sign out
          </button>
        </form>
      </header>

      {/* ---- Page (or "not for you") ---- */}
      <main className="admin-main">
        {isAdmin(email) ? (
          children
        ) : (
          <Card title="This area is for Lindon admins">
            <p style={{ marginTop: 0 }}>
              You’re signed in as <strong>{email}</strong>, which isn’t an admin account. Sign out and sign in with your admin email to review access
              requests.
            </p>
          </Card>
        )}
      </main>
    </div>
  )
}
