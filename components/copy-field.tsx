'use client'
// =============================================================================
// components/copy-field.tsx — a read-only text box with a "Copy" button
// (e.g. the private calendar link in Settings)
// =============================================================================
import { useState } from 'react'

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} style={{ flex: 1, minWidth: 0 }} />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
