// =============================================================================
// components/logo.tsx — Lindon logo mark: a single quaver in a rounded square
// Purple tile (--primary), white note — the Heather palette.
// =============================================================================

export function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="logo-mark">
      <rect width="48" height="48" rx="13" fill="var(--primary)" />
      {/* Quaver: tilted note head, stem, curled flag */}
      <ellipse cx="19" cy="33" rx="6.2" ry="4.8" transform="rotate(-22 19 33)" fill="#fff" />
      <path d="M24.4 31.5V11" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M24.4 11c0 5 8 6.5 8 13.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  )
}
