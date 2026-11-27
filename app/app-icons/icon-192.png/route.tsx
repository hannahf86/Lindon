// app/app-icons/icon-192.png — installed-app icon (192px) for app/manifest.ts
import { appIcon } from '@/lib/app-icon'

export const dynamic = 'force-static'

export function GET() {
  return appIcon(192)
}
