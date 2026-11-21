// =============================================================================
// app/welcome/page.tsx — onboarding for a new teacher (one page)
//
// Your studio details, how you charge, and which features you'd like. Shown
// until it's been saved once (teachers.onboarded_at); after that everything
// here lives in Settings. Outside the (app) group so there's no sidebar yet.
// =============================================================================
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { requireTeacher } from '@/lib/db'
import { LogoMark } from '@/components/logo'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Card, TextField } from '@/components/ui'
import { FeatureFields } from '@/components/feature-fields'
import { completeOnboarding } from './actions'

export const metadata: Metadata = { title: 'Welcome' }

export default async function WelcomePage() {
  const teacher = await requireTeacher()
  if (teacher.onboarded_at) redirect('/settings')
  const firstName = teacher.display_name.split(' ')[0]

  return (
    <div className="welcome">
      {/* ---- Brand bar ---- */}
      <header className="welcome-bar">
        <LogoMark size={36} />
        <span>Lindon</span>
      </header>

      <main className="welcome-main">
        <h1>Welcome{firstName ? `, ${firstName}` : ''}!</h1>
        <p className="muted" style={{ fontSize: '1.1rem', marginTop: 0 }}>
          Let’s set Lindon up the way you teach. This takes a minute, and you can change any of it later in Settings.
        </p>

        <ActionForm action={completeOnboarding}>
          {/* ---- Studio ---- */}
          <Card title="Your studio">
            <div className="form-grid">
              <TextField label="Your name" name="display_name" defaultValue={teacher.display_name} required hint="Used to sign your emails." />
              <TextField label="Studio / business name" name="business_name" defaultValue={teacher.business_name} hint="Shown on emails and invoices." />
              <TextField label="Email for replies" name="email" type="email" defaultValue={teacher.email} hint="When families reply, it comes here." />
              <TextField label="Phone" name="phone" type="tel" defaultValue={teacher.phone} hint="Optional — shown to families so they can reach you." />
            </div>
          </Card>

          {/* ---- How you work ---- */}
          <FeatureFields teacher={teacher} />

          <div className="form-actions">
            <SubmitButton pendingText="Saving…">Start using Lindon</SubmitButton>
          </div>
        </ActionForm>
      </main>
    </div>
  )
}
