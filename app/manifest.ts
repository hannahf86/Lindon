// =============================================================================
// app/manifest.ts — lets Lindon be "installed" as a desktop / home-screen app
//
// Served at /manifest.webmanifest (public in proxy.ts — browsers fetch it
// without cookies). Icons come from app/app-icons/*.png/route.tsx.
// Opens on / (teachers land on the dashboard, families on their home page)
// in its own window, without the browser's address bar.
// =============================================================================
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lindon',
    short_name: 'Lindon',
    description: 'Students, lessons, invoices and more for instrumental music teachers.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#faf7f2',
    theme_color: '#3b2a54',
    icons: [
      { src: '/app-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app-icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
