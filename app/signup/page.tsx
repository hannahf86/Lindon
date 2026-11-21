// =============================================================================
// app/signup/page.tsx — "Create an account" (request access while invite-only)
// Same two-panel layout as sign-in: teal brand panel + the form.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { openSignup } from '@/lib/access'
import { LogoMark } from '@/components/logo'
import { ActionForm, SubmitButton } from '@/components/forms'
import { TextField } from '@/components/ui'
import { requestAccess } from './actions'

export const metadata: Metadata = { title: 'Create an account' }

export default async function SignupPage() {
  const session = await auth()
  if (session?.user) redirect('/')

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
          <p>Pupils, bookings, lesson notes, invoices and reminders — in one friendly place.</p>
        </div>
        <div className="auth-stripe" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>

      {/* ---- Request form ---- */}
      <section className="auth-panel">
        <div className="auth-card">
          <h2 style={{ fontSize: '1.75rem', marginBottom: 8 }}>Create an account</h2>
          <p className="muted">
            {openSignup
              ? "Tell us a little about you and we'll email you a sign-in link."
              : "Lindon is invite-only for now. Tell us a little about you and we'll email you as soon as your account is ready."}
          </p>
          <ActionForm action={requestAccess} className="form" resetOnSuccess>
            <TextField label="Your name" name="name" required autoComplete="name" />
            <TextField label="Studio or business name" name="studio" placeholder="e.g. Hart Music Studio" hint="Optional — shown on invoices and emails." />
            <TextField label="Email address" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
            <TextField label="What do you teach?" name="teaches" placeholder="e.g. Piano and violin, about 25 pupils" />
            <SubmitButton pendingText="Sending…">{openSignup ? 'Create my account' : 'Request an account'}</SubmitButton>
          </ActionForm>
          <p className="small muted" style={{ marginTop: 18 }}>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </div>
  )
}
