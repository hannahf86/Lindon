// =============================================================================
// app/family/layout.tsx — the family area shell (parents & adult pupils)
//
// Plum top bar: Lindon logo, nav pills (Home · Lessons · Messages · Invoices),
// the signed-in email, Password (sign-in settings) and Sign out. Deliberately NOT inside the (app) group,
// so families never see the teacher sidebar. requireFamily() redirects anyone
// without a live invitation.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { signOut } from '@/auth'
import { requireFamily } from '@/lib/family'
import { LogoMark } from '@/components/logo'
import { FamilyNav } from '@/components/family-nav'
import { MobileMenu } from '@/components/mobile-menu'
import { familyUnread, messagingLinks } from './_lib/family-data'

export const metadata: Metadata = { title: { default: 'Family', template: '%s · Lindon' } }

// Family-only styles (kept here so the shared stylesheet stays untouched)
const FAMILY_CSS = `
.fam-bar { background: var(--sidebar-bg); color: #fff; }
.fam-bar-inner { max-width: 1180px; margin: 0 auto; padding: 12px 24px; display: flex; align-items: center; gap: 12px 32px; flex-wrap: wrap; }
.fam-brand { display: flex; align-items: center; gap: 10px; color: #fff; text-decoration: none; font-weight: 900; font-size: 1.3rem; }
.fam-brand:hover { color: #fff; }
.fam-nav { display: flex; gap: 12px; overflow-x: auto; scrollbar-width: none; flex: 1 1 auto; min-width: 0; }
.fam-nav::-webkit-scrollbar { display: none; }
.fam-nav a { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; padding: 8px 18px; border-radius: 999px; color: #fff; text-decoration: none; font-weight: 800; background: rgb(255 255 255 / 0.14); }
.fam-nav a:hover { background: rgb(255 255 255 / 0.24); color: #fff; }
.fam-nav a[aria-current='page'] { background: var(--nav-active-bg); color: var(--nav-active-text); }
.fam-count { background: var(--coral); color: var(--ink); border-radius: 999px; font-size: 0.75rem; font-weight: 900; padding: 1px 7px; line-height: 1.4; }
.fam-who { display: flex; align-items: center; gap: 12px; font-size: 0.85rem; margin-left: auto; min-width: 0; }
.fam-account { color: #fff; font-weight: 800; }
.fam-account:hover { color: #fff; }
.fam-who span { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.fam-main { max-width: 1180px; margin: 0 auto; padding: 36px 24px 72px; }
/* Family home: roomier layout */
.fam-home .page-head { margin-bottom: 24px; }
.fam-home .tip { margin-bottom: 32px; }
.fam-teacher { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px 24px; padding-bottom: 20px; margin-bottom: 8px; border-bottom: 2px solid var(--line-soft); }
.fam-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; align-items: stretch; }
.fam-grid > .card { margin: 0; height: 100%; }
@media (max-width: 800px) { .fam-grid { grid-template-columns: 1fr; } }
.bubble-list { display: flex; flex-direction: column; gap: 12px; }
.bubble { max-width: min(560px, 85%); padding: 10px 14px; border-radius: 16px; white-space: pre-wrap; overflow-wrap: anywhere; }
.bubble.mine { align-self: flex-end; background: var(--teal-wash); border-bottom-right-radius: 4px; }
.bubble.theirs { align-self: flex-start; background: #fff; border: 2px solid var(--line); border-bottom-left-radius: 4px; }
.bubble-meta { font-size: 0.75rem; color: var(--muted); font-weight: 700; margin-bottom: 2px; white-space: normal; }
.pre { white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 700px) {
  .fam-nav { flex-direction: column; overflow: visible; gap: 6px; }
  .fam-nav a { justify-content: space-between; padding: 12px 16px; }
  .fam-who { margin: 8px 0 0; padding-top: 12px; border-top: 1px solid rgb(255 255 255 / 0.2); justify-content: space-between; flex-wrap: wrap; }
  .fam-brand { margin-right: auto; }
  .fam-main { padding-top: 20px; }
}
@media print { .fam-bar { display: none !important; } .fam-main { padding: 0; max-width: none; } }
`

export default async function FamilyLayout({ children }: LayoutProps<'/family'>) {
  const ctx = await requireFamily()
  const unread = await familyUnread(ctx)

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
          {/* Phones: nav + account links behind a hamburger */}
          <MobileMenu unread={unread} className="fam-menu">
          <FamilyNav unread={unread} showMessages={messagingLinks(ctx).length > 0} />
          <div className="fam-who">
            <span title={ctx.email}>{ctx.email}</span>
            <Link href="/account" className="fam-account">
              Password
            </Link>
            <form action={doSignOut}>
              <button className="linkish" type="submit">
                Sign out
              </button>
            </form>
          </div>
          </MobileMenu>
        </div>
      </header>

      {/* ---- Page content ---- */}
      <main className="fam-main">{children}</main>
    </>
  )
}
