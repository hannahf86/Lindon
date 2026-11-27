// =============================================================================
// settings/page.tsx — Settings, in four tabs (?tab=…):
//
//   Studio info     your name, studio, contact details · locations ·
//                   calendar link (Google / Apple / Outlook) · teaching hours (its own add/remove forms, so it sits below
//                   the tab's Save button)
//   Invoicing       how you charge · invoice numbering, terms, how to pay ·
//                   footer note · money & time · invoice branding colours
//   Communication   lesson reminders · exam reminders · message alerts
//   Features        the optional parts of Lindon, on or off
//   Policies        privacy & data protection, child protection, terms (public pages)
//   Account         delete your Lindon account for good
//
// Each tab is its own form and saves only its own fields (the action is told
// which tab via a hidden "section" field). Currency and timezone are typed
// (checked on save). Admin and password links stay above the tabs.
// =============================================================================
import type { Metadata } from 'next'
import { auth } from '@/auth'
import Link from 'next/link'
import { requireTeacher } from '@/lib/db'
import { db } from '@/lib/admin'
import { isAdmin } from '@/lib/access'
import { has } from '@/lib/features'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Card, PageHeader, TextArea, TextField, Toggle } from '@/components/ui'
import { ChargingFields, FeatureToggles } from '@/components/feature-fields'
import { TeachingHoursEditor } from '@/components/teaching-hours'
import { TagInput } from '@/components/pickers'
import { POLICIES } from '@/lib/policies'
import { CopyField } from '@/components/copy-field'
import { InstallButton } from '@/components/install-app'
import { calendarFeedUrl } from '@/lib/calendar-feed'
import { deleteAccount, makeCalendarLink, removeCalendarLink, removeLogo, updateSettings, uploadLogo } from './actions'

export const metadata: Metadata = { title: 'Settings' }

const TABS = [
  { key: 'studio', label: 'Studio info' },
  { key: 'invoicing', label: 'Invoicing' },
  { key: 'communication', label: 'Communication' },
  { key: 'features', label: 'Features' },
  { key: 'policies', label: 'Policies' },
  { key: 'account', label: 'Account' },
] as const
type Tab = (typeof TABS)[number]['key']

export default async function SettingsPage({ searchParams }: PageProps<'/settings'>) {
  const [teacher, session, sp] = await Promise.all([requireTeacher(), auth(), searchParams])
  const t = teacher
  const tab: Tab = TABS.find((x) => x.key === sp.tab)?.key ?? 'studio'
  const signedInAs = session?.user?.email ?? ''
  // Admins approve new teachers while sign-up is invite-only
  const admin = isAdmin(signedInAs)
  const { count: pendingRequests } = admin
    ? await db().from('access_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    : { count: 0 }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={
          <>
            Signed in as <strong>{signedInAs || 'unknown'}</strong>
          </>
        }
      />

      {/* ---- Admin: teachers waiting to join ---- */}
      {admin && (
        <div className={`alert ${pendingRequests ? 'alert-info' : 'alert-ok'} spread`} style={{ marginBottom: 20 }}>
          <span>{pendingRequests ? `${pendingRequests} teacher${pendingRequests === 1 ? ' is' : 's are'} waiting to join Lindon.` : 'No teachers waiting to join.'}</span>
          <Link className="btn btn-sm" href="/admin">
            Access requests
          </Link>
        </div>
      )}

      {/* ---- Password & sign-in (its own page, shared with families) ---- */}
      <div className="alert alert-info spread" style={{ marginBottom: 20 }}>
        <span>Set a password so you can sign in without an emailed link.</span>
        <Link className="btn btn-sm" href="/account">
          Password &amp; sign-in
        </Link>
      </div>

      {/* ---- Desktop / phone shortcut (install as an app) ---- */}
      <div className="alert alert-info spread" style={{ marginBottom: 20 }}>
        <span>Add Lindon to your desktop or phone so it opens like an app.</span>
        <InstallButton />
      </div>

      {/* ---- Tabs ---- */}
      <nav className="tabs" aria-label="Settings sections">
        {TABS.map((x) => (
          <Link key={x.key} href={`/settings?tab=${x.key}`} aria-current={x.key === tab ? 'page' : undefined}>
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === 'studio' && <StudioTab teacher={t} />}
      {tab === 'invoicing' && <InvoicingTab teacher={t} />}
      {tab === 'communication' && <CommunicationTab teacher={t} />}
      {tab === 'features' && <FeaturesTab teacher={t} />}
      {tab === 'policies' && <PoliciesTab />}
      {tab === 'account' && <AccountTab signedInAs={signedInAs} />}
    </>
  )
}

type T = Awaited<ReturnType<typeof requireTeacher>>

// ---- Shared: one tab's form with its Save button ---------------------------------------
function TabForm({ section, children }: { section: Tab; children: React.ReactNode }) {
  return (
    <ActionForm action={updateSettings}>
      <input type="hidden" name="section" value={section} />
      {children}
      <div className="form-actions">
        <SubmitButton>Save</SubmitButton>
      </div>
    </ActionForm>
  )
}

// ---- Studio info: profile · locations · teaching hours -----------------------------------
function StudioTab({ teacher: t }: { teacher: T }) {
  return (
    <>
      <TabForm section="studio">
        <Card title="Your studio">
          <div className="form-grid">
            <TextField label="Your name" name="display_name" defaultValue={t.display_name} placeholder="e.g. Jane Smith" hint="Used to sign your emails." />
            <TextField label="Studio / business name" name="business_name" defaultValue={t.business_name} placeholder="e.g. York Violin Studio" hint="Shown at the top of emails and invoices." />
            <TextField label="Email for replies" name="email" type="email" defaultValue={t.email} hint="When parents reply to a reminder or invoice, it comes here." />
            <TextField label="Phone" name="phone" type="tel" defaultValue={t.phone} />
            <TextArea label="Address" name="address" defaultValue={t.address} wrapClass="full" rows={3} style={{ minHeight: 80 }} hint="Printed on your invoices." />
          </div>
        </Card>

        <Card title="Locations" id="locations">
          <TagInput
            name="locations"
            label="Where you teach"
            defaultValue={t.locations ?? []}
            placeholder="e.g. Home studio — press Enter to add another"
            hint="These are the choices in the Location dropdown when you book a lesson. Remove one with its ×; lessons already booked there keep it."
          />
        </Card>
      </TabForm>

      {/* ---- Calendar link: subscribe from Google / Apple / Outlook ---- */}
      <section id="calendar" style={{ marginTop: 32 }}>
        <Card title="Add your lessons to Google Calendar">
          {t.calendar_token ? (
            <div className="form">
              <CopyField label="Your private calendar link" value={calendarFeedUrl(t.calendar_token)} />
              <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>Copy the link above.</li>
                <li>
                  On a computer, open <strong>Google Calendar</strong>. Next to “Other calendars” on the left, click <strong>+</strong> → <strong>From URL</strong>.
                </li>
                <li>Paste the link and click <strong>Add calendar</strong>. Your lessons and events appear within a few minutes, and on your phone too.</li>
              </ol>
              <p className="small muted" style={{ margin: 0 }}>
                It’s one-way: change lessons here in Lindon. Google checks for changes every few hours, so new bookings can take a while to show. Works with Apple and Outlook calendars as well (“Subscribe to calendar”).
              </p>
              <div className="alert alert-info small">Keep this link to yourself — anyone who has it can see your lesson times and pupils’ names. If it gets shared, make a new one.</div>
              <div className="row">
                <ConfirmButton action={makeCalendarLink} confirm="Make a new link? The current one stops working straight away, so you'll need to add the new one to your calendar." className="btn btn-secondary btn-sm">
                  Make a new link
                </ConfirmButton>
                <ConfirmButton action={removeCalendarLink} confirm="Switch the calendar link off? Your lessons will disappear from any calendar using it." className="btn btn-danger btn-sm">
                  Switch off
                </ConfirmButton>
              </div>
            </div>
          ) : (
            <div className="form">
              <p style={{ margin: 0 }}>Get a private link that puts your lessons and events into Google Calendar (or Apple / Outlook), on your computer and phone.</p>
              <div>
                <ConfirmButton action={makeCalendarLink} confirm="Make your private calendar link?" className="btn">
                  Get my calendar link
                </ConfirmButton>
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* ---- Schedule: teaching hours (saves as you go) ---- */}
      <section id="teaching-hours" style={{ marginTop: 32 }}>
        <h2 style={{ marginBottom: 4 }}>Schedule · teaching hours</h2>
        <p className="small muted" style={{ marginTop: 0, marginBottom: 16 }}>
          The hours you teach each week. Changes save straight away — no need to press Save.
        </p>
        <TeachingHoursEditor teacher={t} />
      </section>
    </>
  )
}

// ---- Invoicing: charging · invoices · footer · money & time · branding -------------------------
function InvoicingTab({ teacher: t }: { teacher: T }) {
  const nextNumberPreview = `${t.invoice_prefix}${String(t.next_invoice_number).padStart(4, '0')}`
  return (
    <>
    <TabForm section="invoicing">
      <Card title="How you charge">
        <ChargingFields teacher={t} />
      </Card>

      <Card title="Invoice settings">
        <div className="form-grid">
          <TextField label="Invoice number prefix" name="invoice_prefix" defaultValue={t.invoice_prefix} autoComplete="off" hint="e.g. INV- or JS-" />
          <TextField
            label="Next invoice number"
            name="next_invoice_number"
            type="number"
            min={1}
            defaultValue={t.next_invoice_number}
            hint={`Your next invoice will be ${nextNumberPreview}.`}
          />
          <TextField
            label="Payment terms (days)"
            name="invoice_terms_days"
            type="number"
            min={0}
            max={365}
            defaultValue={t.invoice_terms_days}
            hint="How long parents have to pay. 0 = due on the day."
          />
          <TextArea
            label="How to pay you"
            name="payment_details"
            defaultValue={t.payment_details}
            wrapClass="full"
            placeholder={'e.g. Bank transfer to\nJ Smith, sort code 00-00-00, account 12345678\nPlease use the invoice number as the reference.'}
            hint="Printed on every invoice."
          />
        </div>
      </Card>

      <Card title="Footer note">
        <TextArea label="Invoice footer" name="invoice_footer" defaultValue={t.invoice_footer} rows={3} style={{ minHeight: 80 }} hint="Small print at the bottom of every invoice, e.g. your cancellation policy." />
      </Card>

      <Card title="Money & time">
        <div className="form-grid">
          <TextField label="Currency" name="currency" defaultValue={t.currency} maxLength={3} autoComplete="off" style={{ textTransform: 'uppercase' }} hint="3-letter code: GBP, EUR, USD…" />
          <TextField
            label="Timezone"
            name="timezone"
            defaultValue={t.timezone}
            autoComplete="off"
            hint="e.g. Europe/London, Europe/Dublin, America/New_York. Lesson times and reminders use this."
          />
        </div>
      </Card>

      <Card title="Invoice branding">
        <p className="small muted" style={{ marginTop: 0 }}>
          The colours on your printed / PDF invoices and invoice emails.
        </p>
        <div className="form-grid">
          <ColourField label="Main colour" name="invoice_color" value={t.invoice_color ?? '#5B3F8C'} hint="Your studio name, totals and the email header." />
          <ColourField label="Accent stripe" name="invoice_accent" value={t.invoice_accent ?? '#E3C67E'} hint="The stripe under the header." />
        </div>
        <div className="brand-preview" style={{ ['--brand' as string]: t.invoice_color ?? '#5B3F8C', ['--brand-accent' as string]: t.invoice_accent ?? '#E3C67E' }}>
          <div className="brand-preview-head">{t.business_name || t.display_name || 'Your studio'}</div>
          <div className="brand-preview-stripe" />
          <div className="small muted" style={{ padding: '10px 14px' }}>
            Preview of the current colours — save to update it.
          </div>
        </div>
      </Card>
    </TabForm>

    {/* ---- Logo (its own form: a file upload) ---- */}
    <section id="logo" style={{ marginTop: 32 }}>
      <Card title="Logo">
        <p className="small muted" style={{ marginTop: 0 }}>
          Shown at the top of your PDF invoices, printed invoices and invoice emails. A PNG or JPG under 900 KB; a wide logo with a transparent or white background works best.
        </p>
        {t.logo_url ? (
          <div className="row" style={{ gap: 16, alignItems: 'center', marginBottom: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t.logo_url} alt="Your logo" style={{ maxHeight: 64, maxWidth: 200, borderRadius: 8, border: '1px solid var(--card-border)', padding: 6, background: '#fff' }} />
            <ConfirmButton action={removeLogo} confirm="Remove your logo from invoices?" className="btn btn-ghost btn-sm">
              Remove
            </ConfirmButton>
          </div>
        ) : null}
        <ActionForm action={uploadLogo} resetOnSuccess>
          <div className="field">
            <label className="field-label" htmlFor="f-logo">
              {t.logo_url ? 'Replace your logo' : 'Upload your logo'}
            </label>
            <input id="f-logo" name="logo" type="file" accept="image/png,image/jpeg" className="input" required />
          </div>
          <div className="form-actions">
            <SubmitButton pendingText="Uploading…">Save logo</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </section>
    </>
  )
}

function ColourField({ label, name, value, hint }: { label: string; name: string; value: string; hint: string }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={`f-${name}`}>
        {label}
      </label>
      <input id={`f-${name}`} className="input input-colour" type="color" name={name} defaultValue={value} />
      <span className="field-hint">{hint}</span>
    </div>
  )
}

// ---- Communication: lesson reminders · exam reminders · messages -------------------------------
function CommunicationTab({ teacher: t }: { teacher: T }) {
  return (
    <TabForm section="communication">
      <Card title="Lesson reminders">
        <div className="form">
          <Toggle
            name="reminders_enabled"
            label="Email lesson reminders"
            defaultChecked={t.reminders_enabled}
            hint="A reminder before each lesson — to parents for under-18s, and to adult pupils themselves. You can switch them off for individual students on their page."
          />
          <div className="form-grid">
            <TextField
              label="How many hours before?"
              name="reminder_hours_before"
              type="number"
              min={1}
              max={168}
              defaultValue={t.reminder_hours_before}
              hint="Between 1 and 168 (a week). 24 = the day before."
            />
          </div>
          <TextArea label="Extra message" name="reminder_message" defaultValue={t.reminder_message} placeholder="e.g. Please remember your practice diary!" hint="Optional — added to every reminder." />
        </div>
      </Card>

      <Card title="Exam reminders">
        <div className="form">
          {!has(t, 'exams') && <div className="alert alert-info">Switch on Exams under the Features tab to use these.</div>}
          <Toggle
            name="exam_reminders_enabled"
            label="Email families before an exam"
            defaultChecked={t.exam_reminders_enabled ?? true}
            hint="One email to the parents (or adult pupil) with the date, time and venue, plus a good-luck note."
          />
          <div className="form-grid">
            <TextField
              label="How many days before?"
              name="exam_reminder_days"
              type="number"
              min={1}
              max={60}
              defaultValue={t.exam_reminder_days ?? 7}
              hint="Between 1 and 60. Sent from 9am your time."
            />
          </div>
        </div>
      </Card>

      <Card title="Messages">
        <div className="form">
          {!has(t, 'messaging') && <div className="alert alert-info">Switch on In-app messages under the Features tab to use these.</div>}
          <Toggle
            name="message_alerts"
            label="Email me when a family sends a message"
            defaultChecked={t.message_alerts ?? true}
            hint="Switch off to only see new messages in Lindon. Families always get an email when you message them."
          />
        </div>
      </Card>
    </TabForm>
  )
}

// ---- Features: switch the optional parts on or off ---------------------------------------------
function FeaturesTab({ teacher: t }: { teacher: T }) {
  return (
    <TabForm section="features">
      <Card title="Features">
        <FeatureToggles teacher={t} withReminders={false} />
      </Card>
    </TabForm>
  )
}

// ---- Policies: the public pages families can read too -----------------------------------------
function PoliciesTab() {
  return (
    <Card title="Policies">
      <p className="small muted" style={{ marginTop: 0 }}>
        These pages are public, so families can read them too — they’re linked from the sign-in page, the family area and the family welcome page.
      </p>
      <ul className="list">
        {POLICIES.map((p) => (
          <li key={p.href} className="spread">
            <span>
              <strong>{p.label}</strong>
              <div className="small muted">{p.blurb}</div>
            </span>
            <Link href={p.href} className="btn btn-secondary btn-sm" target="_blank">
              Read
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ---- Account: delete everything, for good ---------------------------------------------------
function AccountTab({ signedInAs }: { signedInAs: string }) {
  return (
    <Card title="Delete your account">
      <p style={{ marginTop: 0 }}>
        This permanently deletes the Lindon account for <strong>{signedInAs}</strong> and everything in your studio: students, contacts, lessons,
        invoices, messages, events, loans, shared files and family logins. Families will no longer be able to sign in to see any of it.
      </p>
      <p className="small muted">
        It can’t be undone. If you might want your records, download any invoice PDFs you need first. To use Lindon again later you’d need to
        request a new account.
      </p>
      <ActionForm action={deleteAccount}>
        <div className="form-grid">
          <TextField label="Type DELETE to confirm" name="confirm" autoComplete="off" required />
        </div>
        <div className="form-actions">
          <SubmitButton className="btn btn-danger" pendingText="Deleting…">
            Delete my account
          </SubmitButton>
        </div>
      </ActionForm>
    </Card>
  )
}
