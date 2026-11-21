// =============================================================================
// app/family/layout.tsx — the family area shell (parents & adult pupils)
//
// Teal top bar: Lindon logo, nav pills (Home · Lessons · Invoices),
// the signed-in email and Sign out. Deliberately NOT inside the (app) group,
// so families never see the teacher sidebar. requireFamily() redirects anyone
// without a live invitation.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { signOut } from '@/auth'
import { requireFamily } from '@/lib/family'
import { LogoMark } from '@/components/logo'
import { FamilyNav } from '@/components/family-nav'

export const metadata: Metadata = { title: { default: 'Family', template: '%s · Lindon' } }

// Family-only styles (kept here so the shared stylesheet stays untouched)
const FAMILY_CSS = `
.fam-bar { background: var(--teal-ink); color: #fff; }
.fam-bar-inner { max-width: 960px; margin: 0 auto; padding: 12px 16px; display: flex; align-items: center; gap: 12px 20px; flex-wrap: wrap; }
.fam-brand { display: flex; align-items: center; gap: 10px; color: #fff; text-decoration: none; font-weight: 900; font-size: 1.3rem; }
.fam-brand:hover { color: #fff; }
.fam-nav { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; flex: 1 1 auto; min-width: 0; }
.fam-nav::-webkit-scrollbar { display: none; }
.fam-nav a { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; padding: 7px 14px; border-radius: 999px; color: #fff; text-decoration: none; font-weight: 800; background: rgb(255 255 255 / 0.14); }
.fam-nav a:hover { background: rgb(255 255 255 / 0.24); color: #fff; }
.fam-nav a[aria-current='page'] { background: #fff; color: var(--teal-ink); }
.fam-who { display: flex; align-items: center; gap: 12px; font-size: 0.85rem; margin-left: auto; min-width: 0; }
.fam-who span { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.fam-main { max-width: 960px; margin: 0 auto; padding: 28px 16px 64px; }
.pre { white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 700px) {
  .fam-nav { order: 3; flex-basis: 100%; }
  .fam-main { padding-top: 20px; }
}
@media print { .fam-bar { display: none !important; } .fam-main { padding: 0; max-width: none; } }
`

export default async function FamilyLayout({ children }: LayoutProps<'/family'>) {
  const ctx = await requireFamily()

  async function doSignOut() {
    'use server'
    await signOut({ redirectTo: '/login' })
  }

  return (
    <>
      <style>{FAMILY_CSS}</style>

      {/* ---- Top bar: logo, nav, signed-in email ---- */}
      <header className="fam-bar no-print">
        <div className="fam-bar-inner">
          <Link href="/family" className="fam-brand">
            <LogoMark size={32} />
            Lindon
          </Link>
          <FamilyNav />
          <div className="fam-who">
            <span title={ctx.email}>{ctx.email}</span>
            <form action={doSignOut}>
              <button className="linkish" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ---- Page content ---- */}
      <main className="fam-main">{children}</main>
    </>
  )
}
