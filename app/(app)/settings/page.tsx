// =============================================================================
// settings/page.tsx — studio profile, region, invoicing and reminder settings
// Currency and timezone are typed (validated on save) — no dropdowns.
// =============================================================================
import type { Metadata } from 'next'
import { auth } from '@/auth'
import Link from 'next/link'
import { requireTeacher } from '@/lib/db'
import { db } from '@/lib/admin'
import { isAdmin } from '@/lib/access'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Card, PageHeader, TextArea, TextField, Toggle } from '@/components/ui'
import { updateSettings } from './actions'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const [teacher, session] = await Promise.all([requireTeacher(), auth()])
  const t = teacher
  const signedInAs = session?.user?.email ?? ''
  const nextNumberPreview = `${t.invoice_prefix}${String(t.next_invoice_number).padStart(4, '0')}`
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
          <Link className="btn btn-sm" href="/settings/access">
            Access requests
          </Link>
        </div>
      )}

      <ActionForm action={updateSettings}>
        {/* ---- Studio profile ---- */}
        <Card title="Your studio">
          <div className="form-grid">
            <TextField label="Your name" name="display_name" defaultValue={t.display_name} placeholder="e.g. Jane Smith" hint="Used to sign your emails." />
            <TextField label="Studio / business name" name="business_name" defaultValue={t.business_name} placeholder="e.g. York Violin Studio" hint="Shown at the top of emails and invoices." />
            <TextField
              label="Email for replies"
              name="email"
              type="email"
              defaultValue={t.email}
              hint="When parents reply to a reminder or invoice, it comes here."
            />
            <TextField label="Phone" name="phone" type="tel" defaultValue={t.phone} />
            <TextArea label="Address" name="address" defaultValue={t.address} wrapClass="full" rows={3} style={{ minHeight: 80 }} hint="Printed on your invoices." />
          </div>
        </Card>

        {/* ---- Region ---- */}
        <Card title="Money & time">
          <div className="form-grid">
            <TextField
              label="Currency"
              name="currency"
              defaultValue={t.currency}
              maxLength={3}
              autoComplete="off"
              style={{ textTransform: 'uppercase' }}
              hint="3-letter code: GBP, EUR, USD…"
            />
            <TextField
              label="Timezone"
              name="timezone"
              defaultValue={t.timezone}
              autoComplete="off"
              hint="e.g. Europe/London, Europe/Dublin, America/New_York. Lesson times and reminders use this."
            />
          </div>
        </Card>

        {/* ---- Invoicing ---- */}
        <Card title="Invoices">
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
            <TextArea label="Invoice footer" name="invoice_footer" defaultValue={t.invoice_footer} wrapClass="full" rows={3} style={{ minHeight: 80 }} hint="Small print at the bottom, e.g. your cancellation policy." />
          </div>
        </Card>

        {/* ---- Lesson reminders ---- */}
        <Card title="Lesson reminders">
          <div className="form">
            <Toggle
              name="reminders_enabled"
              label="Email a reminder before each lesson"
              defaultChecked={t.reminders_enabled}
              hint="Goes to parents for under-18s, and to the student for adults. You can switch it off for individual students on their page."
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
            <TextArea
              label="Extra message"
              name="reminder_message"
              defaultValue={t.reminder_message}
              placeholder="e.g. Please remember your practice diary!"
              hint="Optional — added to every reminder."
            />
          </div>
        </Card>

        <div className="form-actions">
          <SubmitButton>Save settings</SubmitButton>
        </div>
      </ActionForm>
    </>
  )
}
