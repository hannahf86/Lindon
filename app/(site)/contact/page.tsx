// =============================================================================
// app/(site)/contact/page.tsx — Contact & feedback (public)
//
// Suggest an improvement, report a bug, or ask a question. Pills for what
// it's about (?kind=bug pre-selects one), name, email (filled in when signed
// in), message. Sent to the Lindon admins by email and kept in /admin →
// Feedback. Messages show under the Send button.
// =============================================================================
import type { Metadata } from 'next'
import { auth } from '@/auth'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Segmented, TextArea, TextField } from '@/components/ui'
import { sendFeedback } from './actions'
import { ContactExtras } from './extras'

export const metadata: Metadata = {
  title: 'Contact & feedback',
  description: 'Suggest an improvement to Lindon, report a bug, or ask a question.',
}

const KINDS = [
  { value: 'suggestion', label: 'Suggest an improvement' },
  { value: 'bug', label: 'Report a bug' },
  { value: 'question', label: 'Ask a question' },
  { value: 'other', label: 'Something else' },
]

export default async function ContactPage({ searchParams }: PageProps<'/contact'>) {
  const [session, sp] = await Promise.all([auth(), searchParams])
  const kind = KINDS.find((k) => k.value === sp.kind)?.value ?? 'suggestion'

  return (
    <section className="site-section">
      <div className="site-wrap site-contact">
        {/* ---- Intro ---- */}
        <div>
          <div className="site-eyebrow">Contact &amp; feedback</div>
          <h1 className="site-h1">We’d love to hear from you</h1>
          <p className="site-lead">
            Lindon is built with the teachers who use it. If something would make your week easier, or something isn’t working as it should,
            tell us — every message is read.
          </p>
          <ul className="site-contact-tips">
            <li>
              <strong>Reporting a bug?</strong> Say what you were doing, what you expected, and what happened instead. A screenshot helps — reply
              to our email with one.
            </li>
            <li>
              <strong>Got an idea?</strong> Tell us the problem it would solve, not just the feature — there may be a simpler way.
            </li>
            <li>
              <strong>A question about a lesson or invoice?</strong> That’s for your teacher — message them in Lindon.
            </li>
          </ul>
        </div>

        {/* ---- Form ---- */}
        <div className="card site-contact-card">
          <ActionForm action={sendFeedback} resetOnSuccess>
            <Segmented label="What’s it about?" name="kind" options={KINDS} defaultValue={kind} />
            <div className="form-grid">
              <TextField label="Your name" name="name" autoComplete="name" defaultValue={session?.user?.name ?? ''} />
              <TextField label="Your email" name="email" type="email" autoComplete="email" required defaultValue={session?.user?.email ?? ''} hint="So we can reply." />
            </div>
            <TextArea label="Your message" name="message" required rows={7} maxLength={5000} />
            <ContactExtras />
            <div className="form-actions">
              <SubmitButton pendingText="Sending…">Send</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </div>
    </section>
  )
}
