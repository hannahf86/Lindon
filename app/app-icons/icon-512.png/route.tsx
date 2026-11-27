// app/app-icons/icon-512.png — installed-app icon (512px) for app/manifest.ts
import { appIcon } from '@/lib/app-icon'

export const dynamic = 'force-static'

export function GET() {
  return appIcon(512)
}
