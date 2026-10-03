// =============================================================================
// app/login/check-email/page.tsx — "we've sent you a link" confirmation
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { LogoMark } from '@/components/logo'

export const metadata: Metadata = { title: 'Check your email' }

export default function CheckEmailPage() {
  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="row">
          <LogoMark size={40} />
          <span className="eyebrow" style={{ color: '#fff' }}>
            Lindon
          </span>
        </div>
        <h1>
          Check your
          <br />
          inbox
        </h1>
        <div className="auth-stripe" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <h2 style={{ fontSize: '1.75rem', marginBottom: 8 }}>Link sent</h2>
          <p>We&apos;ve emailed you a sign-in link. Open it on this device to continue — it expires in 24 hours.</p>
          <p className="muted small">Nothing arrived? Check your spam folder, or <Link href="/login">try again</Link>.</p>
        </div>
      </section>
    </div>
  )
}
