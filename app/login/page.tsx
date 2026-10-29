// =============================================================================
// app/login/page.tsx — sign-in (magic link by email)
// Left: teal brand panel echoing the brand sheet. Right: email form.
// =============================================================================
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import Link from 'next/link'
import { auth, signIn } from '@/auth'
import { LogoMark } from '@/components/logo'

export const metadata: Metadata = { title: 'Sign in' }

const ERRORS: Record<string, string> = {
  AccessDenied: "There's no Lindon account for that email yet. New here? Create an account below — or check you've typed the address you signed up with.",
  Verification: 'That sign-in link has expired or was already used. Request a new one below.',
  EmailSignin: "We couldn't send the sign-in email. Please try again.",
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const session = await auth()
  if (session?.user) redirect('/')

  const sp = await searchParams
  const error = typeof sp.error === 'string' ? (ERRORS[sp.error] ?? 'Something went wrong signing in. Please try again.') : null
  const callbackUrl = typeof sp.callbackUrl === 'string' && sp.callbackUrl.startsWith('/') ? sp.callbackUrl : '/'

  async function sendLink(formData: FormData) {
    'use server'
    try {
      await signIn('resend', { email: String(formData.get('email') ?? '').trim(), redirectTo: callbackUrl })
    } catch (e) {
      if (e instanceof AuthError) redirect(`/login?error=${e.type === 'AccessDenied' ? 'AccessDenied' : 'EmailSignin'}`)
      throw e // let Next.js handle the redirect to /login/check-email
    }
  }

  return (
    <div className="auth">
      {/* ---- Brand panel ---- */}
      <section className="auth-brand">
        <div className="eyebrow" style={{ color: '#fff' }}>
          For music teachers
        </div>
        <div>
          <LogoMark size={64} />
          <h1>
            Lindon
          </h1>
          <p>Students, lessons, invoices and reminders — everything a music teacher juggles, in one friendly place.</p>
        </div>
        <div className="auth-stripe" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>

      {/* ---- Sign-in form ---- */}
      <section className="auth-panel">
        <div className="auth-card">
          <h2 style={{ fontSize: '1.75rem', marginBottom: 8 }}>Sign in</h2>
          <p className="muted">Enter your email and we&apos;ll send you a sign-in link. No password needed.</p>
          {error && (
            <div className="alert alert-error" role="alert" style={{ margin: '16px 0' }}>
              {error}
            </div>
          )}
          <form action={sendLink} className="form" style={{ marginTop: 20 }}>
            <div className="field">
              <label className="field-label" htmlFor="email">
                Email address
              </label>
              <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" />
            </div>
            <button className="btn" type="submit">
              Email me a sign-in link
            </button>
          </form>
          {/* ---- New teachers ---- */}
          <p className="small muted" style={{ marginTop: 18 }}>
            New to Lindon? <Link href="/signup">Create an account</Link>
          </p>
        </div>
      </section>
    </div>
  )
}
