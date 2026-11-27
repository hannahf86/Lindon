// =============================================================================
// policies/terms/page.tsx — Terms of use (short, plain English)
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_CONTACT_EMAIL } from '@/lib/site'

export const metadata: Metadata = { title: 'Terms of use' }

const UPDATED = '27 November 2026'
const CONTACT = PUBLIC_CONTACT_EMAIL // lib/site.ts (CONTACT_EMAIL)

export default function TermsPage() {
  return (
    <article>
      <h1>Terms of use</h1>
      <p className="policy-updated">Last updated {UPDATED}</p>

      <p>
        These terms cover using Lindon, the lesson and invoicing tool provided by Jorvik Web Dev, whether you are a teacher or a family member with a
        login. By using Lindon you agree to them.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your sign-in details private and don’t let anyone else use your account.</li>
        <li>Make sure the information you add is accurate, and that you have the right to add it.</li>
        <li>Tell us straight away if you think someone else has used your account.</li>
      </ul>

      <h2>Using Lindon properly</h2>
      <ul>
        <li>Use Lindon only for organising music lessons and communicating about them.</li>
        <li>Don’t upload anything unlawful, offensive, or that you don’t have the right to share (for example copyrighted music you may not copy).</li>
        <li>
          Teachers working with children must follow our <Link href="/policies/safeguarding">Child protection &amp; safeguarding</Link> rules.
        </li>
        <li>Don’t try to access information that isn’t yours, or interfere with how Lindon works.</li>
      </ul>

      <h2>Lessons, invoices and payments</h2>
      <p>
        Lessons, prices, cancellation rules and payments are agreed between the teacher and the family. Lindon helps organise them but isn’t a party
        to that agreement, and doesn’t take payments. Questions about a lesson or an invoice should go to the teacher.
      </p>

      <h2>Availability</h2>
      <p>
        We work hard to keep Lindon running and your information safe, but we can’t promise it will always be available or free of faults. We may
        change or improve features from time to time.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop using Lindon at any time. A teacher can ask us to close their account. We may suspend or close an account that breaks these
        terms, particularly where children’s safety is concerned.
      </p>

      <h2>Your information</h2>
      <p>
        How we look after information is explained in our <Link href="/policies/privacy">Privacy &amp; data protection</Link> policy.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. These terms are governed by the law of England and Wales.
      </p>
    </article>
  )
}
