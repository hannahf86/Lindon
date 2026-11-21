'use client'
// =============================================================================
// components/month-picker.tsx — "November 2026 ▾" month dropdown
//
// From Hannah's wireframes (dashboard calendar and Invoices). Choosing a month
// navigates to basePath with ?<name>=<value>, keeping any other params given.
// A deliberate exception to the no-dropdowns rule, like lesson length.
// =============================================================================
import { useRouter } from 'next/navigation'

export function MonthPicker(props: {
  basePath: string
  name: string
  value: string
  options: { value: string; label: string }[]
  keep?: Record<string, string>
  label?: string
}) {
  const router = useRouter()
  return (
    <select
      className="input month-picker"
      aria-label={props.label ?? 'Month'}
      value={props.value}
      onChange={(e) => {
        const qs = new URLSearchParams({ ...props.keep, [props.name]: e.target.value })
        router.push(`${props.basePath}?${qs}`)
      }}
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
