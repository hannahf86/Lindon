'use client'
// =============================================================================
// components/sidebar.tsx — main navigation (teal brand band)
// Desktop: fixed left column. Mobile: top band with a swipeable pill strip.
// `unread` (in-app messages from families) shows as a coral pill on Messages.
// =============================================================================
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { LogoMark } from './logo'

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)

const NAV: { group: string; items: { href: string; label: string; icon: ReactNode }[] }[] = [
  {
    group: 'Overview',
    items: [
      { href: '/', label: 'Dashboard', icon: I('M3 11 12 3l9 8M5 10v10h14V10') },
      { href: '/schedule', label: 'Schedule', icon: I('M4 5h16v15H4zM4 10h16M9 3v4M15 3v4') },
    ],
  },
  {
    group: 'People',
    items: [
      { href: '/students', label: 'Students', icon: I('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0') },
      { href: '/contacts', label: 'Parents & contacts', icon: I('M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 11a3 3 0 1 0 0-6M3 20a6 6 0 0 1 12 0M15 20a6 6 0 0 1 6-6') },
    ],
  },
  {
    group: 'Teaching',
    items: [
      { href: '/lessons', label: 'Lessons & notes', icon: I('M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z') },
      { href: '/exams', label: 'Exams', icon: I('M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3') },
      { href: '/library', label: 'Library & loans', icon: I('M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 0 2 2h13') },
    ],
  },
  {
    group: 'Money',
    items: [
      { href: '/invoices', label: 'Invoices', icon: I('M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6') },
      { href: '/equipment', label: 'Equipment for sale', icon: I('M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01') },
      { href: '/reports', label: 'Income reports', icon: I('M4 20V10M10 20V4M16 20v-7M22 20H2') },
    ],
  },
  {
    group: 'Studio',
    items: [
      { href: '/messages', label: 'Messages', icon: I('M3 6h18v12H3zM3 7l9 6 9-6') },
      { href: '/settings', label: 'Settings', icon: I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z') },
    ],
  },
]

export function Sidebar(props: { studio: string; who: string; unread?: number; signOut: () => Promise<void> }) {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'))

  return (
    <aside className="sidebar no-print">
      {/* Wordmark + brand colour stripe */}
      <Link href="/" className="wordmark">
        <LogoMark size={44} />
        <span className="wordmark-text">
          <span className="wordmark-top">Lindon</span>
          <span className="wordmark-name">{props.studio}</span>
        </span>
      </Link>
      <div className="brand-stripe" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>

      {/* Navigation */}
      <nav className="nav" aria-label="Main">
        {NAV.map((g) => (
          <div key={g.group} style={{ display: 'contents' }}>
            <div className="nav-group">{g.group}</div>
            {g.items.map((item) => (
              <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
                {item.icon}
                {item.label}
                {/* Unread messages pill — coral + ink reads on both the teal band and the white active pill */}
                {item.href === '/messages' && !!props.unread && (
                  <span
                    aria-label={`${props.unread} unread`}
                    style={{
                      marginLeft: 'auto',
                      background: 'var(--coral)',
                      color: 'var(--ink)',
                      borderRadius: 999,
                      padding: '1px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 900,
                      lineHeight: 1.5,
                    }}
                  >
                    {props.unread > 99 ? '99+' : props.unread}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Signed-in teacher + sign out */}
      <div className="sidebar-foot">
        <div className="who" title={props.who}>
          {props.who}
        </div>
        <form action={props.signOut}>
          <button className="linkish" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
