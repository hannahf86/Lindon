// =============================================================================
// app/policies/layout.tsx — public policy pages (no sign-in needed)
//
// /policies/privacy       Privacy & data protection (UK GDPR, cookies)
// /policies/safeguarding  Child protection & safeguarding
// /policies/terms         Terms of use
// Linked from Settings → Policies, the sign-in page, the family area and the
// family welcome page. proxy.ts leaves /policies public.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { LogoMark } from '@/components/logo'
import { POLICIES } from '@/lib/policies'

export const metadata: Metadata = { title: { default: 'Policies', template: '%s · Lindon' } }

export default function PoliciesLayout({ children }: LayoutProps<'/policies'>) {
  return (
    <div className="policy-shell">
      <header className="policy-bar">
        <Link href="/" className="policy-brand">
          <LogoMark size={34} />
          Lindon
        </Link>
        <nav className="policy-nav" aria-label="Policies">
          {POLICIES.map((p) => (
            <Link key={p.href} href={p.href}>
              {p.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="policy">{children}</main>
    </div>
  )
}
