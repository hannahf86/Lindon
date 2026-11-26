// =============================================================================
// app/apple-icon.tsx — the home-screen icon for iPhones / iPads (180×180 PNG)
//
// Same mark as app/icon.svg (the browser-tab favicon): a white quaver on the
// Heather primary purple. Next.js renders this to a PNG at build time.
// =============================================================================
import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#5B3F8C' }}>
        <svg width="180" height="180" viewBox="0 0 48 48">
          <ellipse cx="19" cy="33" rx="6.2" ry="4.8" transform="rotate(-22 19 33)" fill="#fff" />
          <path d="M24.4 31.5V11" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
          <path d="M24.4 11c0 5 8 6.5 8 13.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  )
}
