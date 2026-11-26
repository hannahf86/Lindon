'use client'
// =============================================================================
// components/family-nav.tsx — the pill navigation in the family top bar
// Home · Lessons · Messages (with unread count; only when a teacher has
// in-app messages switched on) · Invoices.
// Scrolls sideways on small screens; the current page is marked aria-current.
// Styles live in app/family/layout.tsx (.fam-nav).
// =============================================================================
import Link from 'next/link'
import { UnreadBell } from '@/components/unread-bell'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/family', label: 'Home' },
  { href: '/family/lessons', label: 'Lessons' },
  { href: '/family/messages', label: 'Messages' },
  { href: '/family/music', label: 'Music' },
  { href: '/family/invoices', label: 'Invoices' },
]

export function FamilyNav({ unread, showMessages, showMusic = false }: { unread: number; showMessages: boolean; showMusic?: boolean }) {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/family' ? pathname === '/family' : pathname === href || pathname.startsWith(href + '/'))

  return (
    <nav className="fam-nav" aria-label="Family">
      {ITEMS.filter((i) => (showMessages || i.href !== '/family/messages') && (showMusic || i.href !== '/family/music')).map((item) => (
        <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
          {item.label}
          {/* Unread badge (hidden while reading messages — they're being marked read) */}
          {item.href === '/family/messages' && !isActive(item.href) && <UnreadBell count={unread} />}
        </Link>
      ))}
    </nav>
  )
}
