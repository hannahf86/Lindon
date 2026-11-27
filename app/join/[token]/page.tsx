// =============================================================================
// app/join/[token]/page.tsx — the family welcome page (from the invite email)
//
// No sign-in needed: the link's token is the key (proxy.ts leaves /join
// public). One page, three numbered steps:
//   1 Your details     — parent (or adult pupil): name, phone; email shown
//   2 Lessons          — each pupil's details and regular lessons: day, time,
//                        length, price, how often, where — to check
//   3 Create a password — then they're signed in and taken to /family
// Already done? The link just offers "Sign in". Unknown / removed link:
// a friendly "ask your teacher to resend it".
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { loadInvite } from '@/lib/family-join'
import { dayName, duration, hhmm, money } from '@/lib/format'
import { endTime, frequencyText } from '@/lib/lessons'
import { MIN_PASSWORD_LENGTH } from '@/lib/passwords'
import { LogoMark } from '@/components/logo'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Card, TextField, Toggle } from '@/components/ui'
import { completeJoin } from './actions'

export const metadata: Metadata = { title: 'Welcome to Lindon' }

export default async function JoinPage({ params }: PageProps<'/join/[token]'>) {
  const { token } = await params
  const invite = await loadInvite(token)

  return (
    <main className="join">
      {/* ---- Brand ---- */}
      <div className="join-brand">
        <LogoMark size={40} />
        <span>Lindon</span>
      </div>

      {!invite ? (
        <Card title="This link isn’t working">
          <p style={{ margin: 0 }}>The invitation may have been replaced or removed. Ask your teacher to send it again from Lindon.</p>
        </Card>
      ) : invite.onboarded ? (
        <Card title="You’re all set">
          <p>Your account is ready. Sign in with {invite.email} and your password.</p>
          <Link href="/login" className="btn">
            Sign in
          </Link>
        </Card>
      ) : (
        <JoinForm token={token} invite={invite} />
      )}
    </main>
  )
}

// ---- The three steps ----------------------------------------------------------------------
function JoinForm({ token, invite }: { token: string; invite: NonNullable<Awaited<ReturnType<typeof loadInvite>>> }) {
  const t = invite.teacher
  const teacherName = t.display_name || t.business_name || 'Your teacher'
  const c = t.currency
  const guardian = invite.kind === 'guardian'

  return (
    <>
      <header className="join-head">
        <h1>Welcome{invite.person.first_name ? `, ${invite.person.first_name}` : ''}!</h1>
        <p>
          {teacherName} uses Lindon for lessons, reminders and invoices. Check everything below, then create a password — it takes a minute.
        </p>
      </header>

      <ActionForm action={completeJoin.bind(null, token)}>
        {/* ---- 1. Your details ---- */}
        <Card title="1 · Your details">
          <div className="form-grid">
            <TextField label="First name" name="first_name" defaultValue={invite.person.first_name} required />
            <TextField label="Last name" name="last_name" defaultValue={invite.person.last_name} />
            <div className="field">
              <span className="field-label">Email</span>
              <div className="input" style={{ background: 'var(--line-soft)' }}>
                {invite.email}
              </div>
              <span className="field-hint">You’ll sign in with this. To change it, ask {teacherName}.</span>
            </div>
            <TextField label="Phone" name="phone" type="tel" defaultValue={invite.person.phone} autoComplete="tel" />
          </div>
        </Card>

        {/* ---- 2. Pupil details + lessons ---- */}
        <Card title={guardian ? `2 · ${invite.pupils.length > 1 ? 'Your children’s' : 'Your child’s'} lessons` : '2 · Your lessons'}>
          {invite.pupils.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No lessons are set up yet — {teacherName} will add them.
            </p>
          ) : (
            <div className="stack">
              {invite.pupils.map((p) => (
                <div key={p.id} className="join-pupil">
                  <h3 style={{ margin: '0 0 2px' }}>
                    {p.first_name} {p.last_name}
                  </h3>
                  <div className="small muted">{[p.instruments.join(', '), p.level].filter(Boolean).join(' · ') || 'Music lessons'}</div>
                  {p.lessons.length === 0 ? (
                    <p className="small muted">No regular lesson booked yet.</p>
                  ) : (
                    <ul className="list" style={{ marginTop: 8 }}>
                      {p.lessons.map((l) => {
                        const start = hhmm(l.start_time)
                        return (
                          <li key={l.id} className="spread">
                            <span>
                              <strong>
                                {dayName(l.day_of_week)}s, {start}–{endTime(start, l.duration_minutes)}
                              </strong>
                              <div className="small muted">
                                {[duration(l.duration_minutes), frequencyText(l.repeat_weeks), l.location].filter(Boolean).join(' · ')}
                              </div>
                            </span>
                            <strong>{money(l.price, c)}</strong>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              ))}
              <p className="small muted" style={{ margin: 0 }}>
                Price is per lesson. {t.billing_mode === 'advance' ? 'Invoices come at the start of each month for the month ahead.' : 'Invoices come at the start of each month for the lessons the month before.'}{' '}
                Something not right? Let {teacherName} know{t.email ? ` (${t.email})` : ''}.
              </p>
              <Toggle name="confirm" label="These details look right" />
            </div>
          )}
        </Card>

        {/* ---- 3. Password ---- */}
        <Card title="3 · Create a password">
          <div className="form-grid">
            <TextField label="Password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
            <TextField label="Type it again" name="password_again" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
          </div>
        </Card>

        <p className="small muted" style={{ margin: 0 }}>
          By creating an account you agree to our <Link href="/policies/terms" target="_blank">terms of use</Link>. See how we look after your information in our{' '}
          <Link href="/policies/privacy" target="_blank">privacy policy</Link> and how we keep children safe in our{' '}
          <Link href="/policies/safeguarding" target="_blank">child protection policy</Link>.
        </p>
        <div className="form-actions">
          <SubmitButton pendingText="Setting up…">Create my account</SubmitButton>
        </div>
      </ActionForm>
    </>
  )
}
