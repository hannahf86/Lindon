'use client'
// =============================================================================
// components/link-select.tsx — a dropdown that goes to a page when changed
//
// For list filters and sorting kept in the URL (e.g. Students → Instrument,
// Sort by). Each option's value is the address to go to. (A dropdown here is
// an approved exception — Hannah asked for these, 2026-11-27.)
// =============================================================================
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export function LinkSelect(props: { label: string; value: string; options: { href: string; label: string }[]; id: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <label className="link-select" htmlFor={props.id}>
      <span className="filter-label">{props.label}</span>
      <select id={props.id} className="input" value={props.value} disabled={pending} onChange={(e) => start(() => router.push(e.target.value))}>
        {props.options.map((o) => (
          <option key={o.href} value={o.href}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
