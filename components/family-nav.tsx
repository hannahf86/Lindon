'use client'
// =============================================================================
// components/family-nav.tsx — the pill navigation in the family top bar
// Home · Lessons · Invoices.
// Scrolls sideways on small screens; the current page is marked aria-current.
// Styles live in app/family/layout.tsx (.fam-nav).
// =============================================================================
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/family', label: 'Home' },
  { href: '/family/lessons', label: 'Lessons' },
  { href: '/family/invoices', label: 'Invoices' },
]

export function FamilyNav() {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/family' ? pathname === '/family' : pathname === href || pathname.startsWith(href + '/'))

  return (
    <nav className="fam-nav" aria-label="Family">
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
