// =============================================================================
// policies/safeguarding/page.tsx — Child protection & safeguarding
// How Lindon is built to protect children, the rules for teachers using it,
// and where to report a concern. Keep it in step with the app's rules
// (no child logins, text-only messages via parents, 5-year message record).
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_CONTACT_EMAIL } from '@/lib/site'

export const metadata: Metadata = { title: 'Child protection & safeguarding' }

const UPDATED = '27 November 2026'
const CONTACT = PUBLIC_CONTACT_EMAIL // lib/site.ts (CONTACT_EMAIL)

export default function SafeguardingPage() {
  return (
    <article>
      <h1>Child protection &amp; safeguarding</h1>
      <p className="policy-updated">Last updated {UPDATED}</p>

      <div className="policy-alert">
        <strong>If a child is in immediate danger, call 999.</strong> If you are worried about a child, you can call the NSPCC helpline on{' '}
        <a href="tel:08088005000">0808 800 5000</a>. Children and young people can call Childline free on <a href="tel:08001111">0800 1111</a>.
      </div>

      <p>
        Many of the pupils taught by Lindon’s teachers are children. Keeping them safe comes first. This page explains how Lindon is designed to
        protect children, the rules every teacher using Lindon agrees to, and what to do if you have a concern.
      </p>

      <h2>How Lindon protects children</h2>
      <ul>
        <li>
          <strong>No logins for children.</strong> Pupils under 18 never have their own account. Their parents or guardians sign in instead.
        </li>
        <li>
          <strong>Teachers talk to parents, not children.</strong> In-app messages for a child always go to their parent or guardian. Lindon does
          not let a teacher start a private conversation with an under-18 pupil.
        </li>
        <li>
          <strong>Text-only messages.</strong> Messages can’t contain photos or videos. Music and practice files are shared through a separate, private
          files area, never in chat.
        </li>
        <li>
          <strong>A permanent, honest record.</strong> Messages can’t be edited or deleted by anyone using Lindon, so there is always a true record of
          what was said. They are kept for five years for safeguarding purposes, then deleted automatically.
        </li>
        <li>
          <strong>Families only see their own children.</strong> A parent can see only their own children’s lessons, invoices, messages, files and
          events. Contact details are never shown to other families.
        </li>
        <li>
          <strong>Private files.</strong> Shared music is stored privately and can only be downloaded by the families it was shared with.
        </li>
        <li>
          <strong>Children’s access ends at 18.</strong> When a pupil turns 18, their parents’ access to their records ends; the pupil can be given
          their own adult login.
        </li>
      </ul>

      <h2>Rules for teachers using Lindon</h2>
      <p>By using Lindon with children, a teacher agrees to:</p>
      <ul>
        <li>follow the safeguarding law and guidance that applies to them, and hold any checks their work requires (such as a DBS check);</li>
        <li>communicate about children only with their parents or guardians, and keep all communication professional;</li>
        <li>never use Lindon to share images of children, or to arrange contact with a child outside the teacher’s lessons and events;</li>
        <li>keep their own login private and secure, and not share access with anyone else;</li>
        <li>record only the information they genuinely need, and keep it accurate;</li>
        <li>act promptly on any concern about a child’s welfare, following the steps below.</li>
      </ul>
      <p>We may suspend or close the account of any teacher who breaks these rules, and pass information to the authorities where we must.</p>

      <h2>If you have a concern</h2>
      <ul>
        <li>
          <strong>Immediate danger:</strong> call the police on 999.
        </li>
        <li>
          <strong>A worry about a child’s safety or welfare:</strong> contact your local council’s children’s services (search “report child abuse” at{' '}
          <a href="https://www.gov.uk/report-child-abuse" target="_blank" rel="noopener noreferrer">
            gov.uk/report-child-abuse
          </a>
          ), or the NSPCC on 0808 800 5000.
        </li>
        <li>
          <strong>A concern about a teacher’s conduct:</strong> report it to the local council (the Local Authority Designated Officer, or LADO) and
          tell us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We will co-operate fully with any investigation, including preserving the
          message record.
        </li>
        <li>
          <strong>A concern about Lindon itself</strong> (for example something that seems to put a child at risk): email{' '}
          <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will look into it straight away.
        </li>
      </ul>

      <p>
        See also our <Link href="/policies/privacy">Privacy &amp; data protection</Link> page for how children’s information is looked after.
      </p>
    </article>
  )
}
