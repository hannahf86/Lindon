'use client'
// =============================================================================
// components/row-menu.tsx — the "⋯" button at the end of a table row
//
// Opens a small menu of actions for that row (view, edit, remove…). The items
// are passed in as children, so they can be server-rendered links and
// ConfirmButtons. The menu is position: fixed so the table's horizontal
// scroll box doesn't clip it. Esc, a click elsewhere, or scrolling closes it.
// =============================================================================
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()

  // ---- Close on outside click, Esc, scroll or resize ----
  useEffect(() => {
    if (!pos) return
    const close = () => setPos(null)
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        btn.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [pos])

  // ---- Open just under the button, right-aligned ----
  const toggle = () => {
    if (pos) return setPos(null)
    const r = btn.current!.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }

  return (
    <>
      <button ref={btn} type="button" className="row-menu-btn" aria-label={label} aria-haspopup="menu" aria-expanded={!!pos} aria-controls={id} onClick={toggle}>
        <span aria-hidden>⋯</span>
      </button>
      {pos && (
        <div ref={menu} id={id} role="menu" className="row-menu" style={{ top: pos.top, right: pos.right }}>
          {children}
        </div>
      )}
    </>
  )
}
