// app/app-icons/maskable-512.png — installed-app icon (512px, maskable) for app/manifest.ts
import { appIcon } from '@/lib/app-icon'

export const dynamic = 'force-static'

export function GET() {
  return appIcon(512, true)
}
