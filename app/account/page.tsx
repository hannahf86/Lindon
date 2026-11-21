// =============================================================================
// app/account/page.tsx — Password & sign-in (teachers and families alike)
//
// Set, change or remove a password, so signing in doesn't need an emailed link.
// Being signed in is proof enough (that's how "forgot password" works: sign in
// with an emailed link, then set a new one here). Outside the (app) and
// family groups so both can reach it; the back link goes home, which sends
// each person to their area.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { hasPassword, MIN_PASSWORD_LENGTH } from '@/lib/passwords'
import { LogoMark } from '@/components/logo'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Card, TextField } from '@/components/ui'
import { removePasswordAction, savePassword } from './actions'

export const metadata: Metadata = { title: 'Password & sign-in' }

export default async function AccountPage() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect('/login?callbackUrl=/account')
  const passwordSet = await hasPassword(userId)

  return (
    <div className="welcome">
      {/* ---- Brand bar ---- */}
      <header className="welcome-bar">
        <LogoMark size={36} />
        <span>Lindon</span>
      </header>

      <main className="welcome-main">
        <Link className="back" href="/">
          ← Back
        </Link>
        <h1>Password &amp; sign-in</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Signed in as <strong>{session.user?.email}</strong>. You stay signed in on this device for 90 days.
        </p>

        {/* ---- Password ---- */}
        <Card title={passwordSet ? 'Change your password' : 'Set a password'}>
          <p className="small muted" style={{ marginTop: 0 }}>
            {passwordSet
              ? 'You can sign in with your email and this password. Forgotten it? Sign in with an emailed link and set a new one here.'
              : 'Set a password and you can sign in with your email and password — no emailed link needed.'}
          </p>
          <ActionForm action={savePassword} resetOnSuccess>
            <div className="form-grid">
              <TextField label="New password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
              <TextField label="Type it again" name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
            </div>
            <SubmitButton>{passwordSet ? 'Change password' : 'Set password'}</SubmitButton>
          </ActionForm>
          {passwordSet && (
            <div style={{ marginTop: 14 }}>
              <ConfirmButton action={removePasswordAction} confirm="Remove your password? You'll sign in with an emailed link instead." className="btn btn-ghost btn-sm">
                Remove password
              </ConfirmButton>
            </div>
          )}
        </Card>
      </main>
    </div>
  )
}
