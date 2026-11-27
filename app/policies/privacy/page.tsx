// =============================================================================
// policies/privacy/page.tsx — Privacy & data protection (UK GDPR, cookies)
// Plain English, written to match how Lindon actually works. Keep it in step
// with the app: what's stored, who processes it, how long it's kept.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Privacy & data protection' }

const UPDATED = '27 November 2026'
const CONTACT = 'lindon@jorvikweb.dev'

export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy &amp; data protection</h1>
      <p className="policy-updated">Last updated {UPDATED}</p>

      <p>
        Lindon is an online tool that music teachers use to organise lessons, invoices and messages with the families they teach. It is run by
        Jorvik Web Dev. This page explains what information Lindon holds, why, who can see it, how long it is kept, and your rights under UK data
        protection law (the UK GDPR and the Data Protection Act 2018).
      </p>

      <h2>Who is responsible for your information</h2>
      <ul>
        <li>
          <strong>Your music teacher</strong> decides what information about their pupils and families goes into Lindon and what it is used for. They
          are the <em>data controller</em> for that information. Questions about your lessons, invoices or what your teacher holds about you should go
          to your teacher first.
        </li>
        <li>
          <strong>Jorvik Web Dev</strong> provides Lindon and looks after the information on the teacher’s behalf (the <em>data processor</em>). We
          only use it to run the service for that teacher. For teachers’ own account details, Jorvik Web Dev is the data controller.
        </li>
      </ul>

      <h2>What Lindon holds</h2>
      <ul>
        <li>
          <strong>Teachers:</strong> name, studio name, email, phone, address, payment details shown on invoices, settings, and a securely scrambled
          (hashed) password — we never store passwords in a readable form.
        </li>
        <li>
          <strong>Pupils:</strong> name, whether they are a child or an adult, date of birth (optional), instruments, level, lessons and attendance,
          make-up credits, exams, loans of instruments or books, and the teacher’s private notes (only the teacher can see these).
        </li>
        <li>
          <strong>Parents and guardians, and adult pupils:</strong> name, email, phone and address, so the teacher can send reminders, invoices and
          messages.
        </li>
        <li>
          <strong>Invoices and payments:</strong> what was charged, when it was sent and paid. Lindon does not take card payments and never stores
          bank or card details for families.
        </li>
        <li>
          <strong>Messages, files and replies:</strong> in-app messages between teacher and family, music files the teacher shares, and replies to
          events (“Coming” / “Can’t make it”).
        </li>
        <li>
          <strong>A record of emails sent</strong> (who to, when, and whether it was delivered), so problems can be put right.
        </li>
      </ul>

      <h2>Why it’s used</h2>
      <p>
        Only to provide lessons and run the teacher’s studio: scheduling, reminders, invoices, messages and sharing practice material. The lawful
        basis is the teacher’s contract with the family and the teacher’s legitimate interest in running their lessons safely and efficiently.
        Lindon does not sell information, show adverts, or use it for marketing.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>The teacher can see everything about their own pupils and families — no other teacher can.</li>
        <li>
          A parent or guardian with a login sees only their own children’s lessons, invoices, messages, files and events. An adult pupil sees only
          their own. Children do not have logins.
        </li>
        <li>
          Lindon uses trusted service providers to run: <strong>Supabase</strong> (database and secure file storage), <strong>Vercel</strong>{' '}
          (hosting the website) and <strong>Resend</strong> (sending emails). They process information only on our instructions. Some of their
          systems may be outside the UK; where that happens, transfers are protected by recognised safeguards such as UK-approved contract terms.
        </li>
      </ul>

      <h2>How long it’s kept</h2>
      <ul>
        <li>Messages are kept for five years, then deleted automatically.</li>
        <li>
          When a teacher deletes a pupil, that pupil’s lessons, bookings, invoices and related records are deleted with them. A teacher can archive a
          pupil instead to keep their history.
        </li>
        <li>
          A teacher can ask us to close their account and delete their studio’s information. Some records (for example invoices) may need to be kept
          for longer where the law requires it, such as for tax.
        </li>
      </ul>

      <h2>Keeping it safe</h2>
      <p>
        Lindon is only available over a secure (encrypted) connection. Information is stored in a database that the public cannot reach directly;
        every request is checked against the signed-in person’s access. Shared files are private and can only be downloaded through Lindon, using
        links that expire after a minute. Passwords are hashed, accounts are locked for a while after repeated wrong passwords, and sign-in links
        expire after 24 hours.
      </p>

      <h2>Cookies</h2>
      <p>
        Lindon uses one essential cookie to keep you signed in (it lasts up to 90 days, or until you sign out). There are no advertising or tracking
        cookies and no analytics that follow you around the web, so there is nothing to opt out of.
      </p>

      <h2>Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>ask for a copy of the information held about you;</li>
        <li>have anything wrong corrected;</li>
        <li>ask for information to be deleted, or for its use to be restricted;</li>
        <li>object to how it is used, and ask for it in a format you can take elsewhere.</li>
      </ul>
      <p>
        Please ask your teacher first, as they control their pupils’ information. You can also contact us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will help, or pass your request to your teacher. If you are unhappy with how your
        information has been handled, you can complain to the Information Commissioner’s Office (ICO) at{' '}
        <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">
          ico.org.uk
        </a>{' '}
        or on 0303 123 1113.
      </p>

      <h2>Children’s information</h2>
      <p>
        Lindon is designed with children’s privacy in mind: children never have their own login, and their information is shared only with their own
        parents or guardians. See our <Link href="/policies/safeguarding">Child protection &amp; safeguarding</Link> page for more.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes, we will update the date at the top of this page.</p>
    </article>
  )
}
