// =============================================================================
// components/logo.tsx — Lindon logo mark: a single quaver in a rounded square
// White tile, teal-ink note — sits above the "Lindon" wordmark on teal.
// =============================================================================

export function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="logo-mark">
      <rect width="48" height="48" rx="13" fill="#fff" />
      {/* Quaver: tilted note head, stem, curled flag */}
      <ellipse cx="19" cy="33" rx="6.2" ry="4.8" transform="rotate(-22 19 33)" fill="var(--teal-ink)" />
      <path d="M24.4 31.5V11" stroke="var(--teal-ink)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M24.4 11c0 5 8 6.5 8 13.5" fill="none" stroke="var(--teal-ink)" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  )
}
