// =============================================================================
// app/login/page.tsx — sign in
// Left: teal brand panel echoing the brand sheet. Right: the sign-in card —
// email + password, and "email me a link" as the fallback (which is also how
// to get in if you forget your password).
// =============================================================================
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthError } from 'next-auth'
import Link from 'next/link'
import { POLICIES } from '@/lib/policies'
import { auth, signIn } from '@/auth'
import { LogoMark } from '@/components/logo'

export const metadata: Metadata = { title: 'Sign in' }

const ERRORS: Record<string, string> = {
  AccessDenied: "There's no Lindon account for that email yet. New here? Create an account below — or check you've typed the address you signed up with.",
  CredentialsSignin:
    "That email and password don't match. Check them and try again — or use “Email me a sign-in link” below, then set a new password. (After 10 wrong tries, password sign-in pauses for 15 minutes.)",
  Verification: 'That sign-in link has expired or was already used. Request a new one below.',
  EmailSignin: "We couldn't send the sign-in email. Please try again in a minute — if it keeps happening, let us know.",
  // Auth.js reports a failed email send (e.g. the mail service refusing it) as a configuration error
  Configuration: "We couldn't send the sign-in email just now. Please try again in a minute — if it keeps happening, let us know.",
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const session = await auth()
  if (session?.user) redirect('/')

  const sp = await searchParams
  const error = typeof sp.error === 'string' ? (ERRORS[sp.error] ?? 'Something went wrong signing in. Please try again.') : null
  const deleted = sp.deleted === '1'
  const callbackUrl = typeof sp.callbackUrl === 'string' && sp.callbackUrl.startsWith('/') ? sp.callbackUrl : '/'

  // ---- The two ways in (each runs on the server) ----
  async function withPassword(formData: FormData) {
    'use server'
    try {
      await signIn('credentials', {
        email: String(formData.get('email') ?? '').trim(),
        password: String(formData.get('password') ?? ''),
        redirectTo: callbackUrl,
      })
    } catch (e) {
      if (e instanceof AuthError) redirect(`/login?error=${e.type === 'AccessDenied' ? 'AccessDenied' : 'CredentialsSignin'}`)
      throw e // a successful sign-in redirects by throwing — let Next.js handle it
    }
  }

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
          <h1>Lindon</h1>
          <p>Lessons and invoices for music teachers — and their families — in one friendly place.</p>
        </div>
        <div className="auth-stripe" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>

      {/* ---- Sign-in card ---- */}
      <section className="auth-panel">
        <div className="auth-card">
          <h2 style={{ fontSize: '1.75rem', marginBottom: 8 }}>Sign in</h2>
          {deleted && !error && (
            <div className="alert alert-ok" role="status" style={{ margin: '16px 0' }}>
              Your account and studio have been deleted.
            </div>
          )}
          {error && (
            <div className="alert alert-error" role="alert" style={{ margin: '16px 0' }}>
              {error}
            </div>
          )}

          {/* Email + password */}
          <form action={withPassword} className="form" style={{ marginTop: 16 }}>
            <div className="field">
              <label className="field-label" htmlFor="email">
                Email address
              </label>
              <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
            </div>
            <button className="btn" type="submit">
              Sign in
            </button>
          </form>

          {/* Magic link — no password yet, or forgotten it */}
          <details className="auth-link-option">
            <summary>No password yet, or forgotten it? Email me a sign-in link</summary>
            <form action={sendLink} className="form" style={{ marginTop: 12 }}>
              <div className="field">
                <label className="field-label" htmlFor="link-email">
                  Email address
                </label>
                <input id="link-email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@example.com" />
              </div>
              <button className="btn btn-secondary" type="submit">
                Email me a sign-in link
              </button>
              <p className="small muted" style={{ margin: 0 }}>
                Once you’re in, set a password under <strong>Password &amp; sign-in</strong> so you don’t need an email next time.
              </p>
            </form>
          </details>

          {/* ---- New teachers ---- */}
          <p className="small muted" style={{ marginTop: 18 }}>
            New to Lindon? <Link href="/signup">Create an account</Link>
          </p>

          {/* ---- Policies (public pages) ---- */}
          <nav className="auth-policies" aria-label="Policies">
            {POLICIES.map((p) => (
              <Link key={p.href} href={p.href}>
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </div>
  )
}
