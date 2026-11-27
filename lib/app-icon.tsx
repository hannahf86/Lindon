// =============================================================================
// lib/app-icon.tsx — the installed-app icon as a PNG (for app/manifest.ts)
//
// Same mark as app/icon.svg and app/apple-icon.tsx: a white quaver on the
// Heather purple. "maskable" shrinks the mark into the middle so phones that
// crop icons into circles or squircles don't cut it off.
// =============================================================================
import { ImageResponse } from 'next/og'

export function appIcon(size: number, maskable = false) {
  const mark = Math.round(size * (maskable ? 0.62 : 1))
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#5B3F8C' }}>
        <svg width={mark} height={mark} viewBox="0 0 48 48">
          <ellipse cx="19" cy="33" rx="6.2" ry="4.8" transform="rotate(-22 19 33)" fill="#fff" />
          <path d="M24.4 31.5V11" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M24.4 11c0 5 8 6.5 8 13.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  )
}
