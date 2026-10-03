'use client'
// =============================================================================
// components/family-nav.tsx — the pill navigation in the family top bar
// Home · Lessons · Messages (with unread count) · Invoices.
// Scrolls sideways on small screens; the current page is marked aria-current.
// Styles live in app/family/layout.tsx (.fam-nav).
// =============================================================================
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/family', label: 'Home' },
  { href: '/family/lessons', label: 'Lessons' },
  { href: '/family/messages', label: 'Messages' },
  { href: '/family/invoices', label: 'Invoices' },
]

export function FamilyNav({ unread }: { unread: number }) {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/family' ? pathname === '/family' : pathname === href || pathname.startsWith(href + '/'))

  return (
    <nav className="fam-nav" aria-label="Family">
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
          {item.label}
          {/* Unread badge (hidden while reading messages — they're being marked read) */}
          {item.href === '/family/messages' && unread > 0 && !isActive(item.href) && (
            <span className="fam-count" aria-label={`${unread} unread`}>
              {unread}
            </span>
          )}
        </Link>
      ))}
    </nav>
  )
}
