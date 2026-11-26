'use client'
// =============================================================================
// components/mobile-menu.tsx — hamburger menu for small screens
//
// On phones / small tablets (the breakpoints are in globals.css) the wrapped
// navigation is hidden behind a ☰ button and drops down as a full-width list
// when tapped (Hannah's call: no sideways-scrolling strip). On larger screens
// the button is hidden and the children show as normal (display: contents).
// Closes when a link is followed (route change) or with Escape. A small
// coral dot on the button shows when there are unread messages.
// Used by the teacher sidebar and the family top bar.
// =============================================================================
import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

export function MobileMenu({ children, unread = 0, className = '' }: { children: ReactNode; unread?: number; className?: string }) {
  // Remember which page the menu was opened on: following a link changes the
  // page, so the menu closes by itself
  const pathname = usePathname()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (next: boolean | ((o: boolean) => boolean)) => setOpenOn((typeof next === 'function' ? next(open) : next) ? pathname : null)

  // ---- Close on Escape ----
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenOn(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="mobile-menu-panel" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
        {!open && unread > 0 && <span className="menu-toggle-dot" aria-hidden />}
      </button>
      <div id="mobile-menu-panel" className={`menu-panel ${className}`} data-open={open}>
        {children}
      </div>
    </>
  )
}
