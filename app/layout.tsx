// =============================================================================
// app/layout.tsx — root layout: Nunito font + global styles
// Also catches the browser's "install this app" offer for Settings → Add a shortcut.
// =============================================================================
import type { Metadata, Viewport } from 'next'
import { Nunito } from 'next/font/google'
import './globals.css'
import { InstallCatcher } from '@/components/install-app'

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: { default: 'Lindon', template: '%s · Lindon' },
  description: 'Students, lessons, invoices and more for instrumental music teachers.',
  appleWebApp: { capable: true, title: 'Lindon', statusBarStyle: 'default' },
}

// The installed app's title-bar colour (the sidebar plum)
export const viewport: Viewport = { themeColor: '#3b2a54' }

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-GB" className={nunito.variable}>
      <body>
        <InstallCatcher />
        {children}
      </body>
    </html>
  )
}
