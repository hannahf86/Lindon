// =============================================================================
// app/layout.tsx — root layout: Nunito font + global styles
// =============================================================================
import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'
import './globals.css'

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: { default: 'Lindon', template: '%s · Lindon' },
  description: 'Students, lessons, invoices and more for instrumental music teachers.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-GB" className={nunito.variable}>
      <body>{children}</body>
    </html>
  )
}
