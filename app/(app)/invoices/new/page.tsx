// =============================================================================
// invoices/new/page.tsx — start an invoice: choose the student and the dates
// to bill for. Their chargeable lessons in that period are added automatically
// (unless switched off for an equipment-only invoice).
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireTeacher } from '@/lib/db'
import { monthBounds, todayISO } from '@/lib/dates'
import { studentOptions } from '@/lib/queries'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Picker } from '@/components/pickers'
import { Card, PageHeader, TextField, Toggle } from '@/components/ui'
import { createInvoice } from '../actions'

export const metadata: Metadata = { title: 'New invoice' }

export default async function NewInvoicePage({ searchParams }: PageProps<'/invoices/new'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const today = todayISO(teacher.timezone)
  const [monthStart, monthEnd] = monthBounds(today)
  const students = await studentOptions(teacher.id, { includeLeft: true })
  const preselected = typeof sp.student === 'string' && students.some((s) => s.id === sp.student) ? sp.student : null

  return (
    <>
      <PageHeader title="New invoice" back={{ href: '/invoices', label: 'Invoices' }} />

      <ActionForm action={createInvoice}>
        {/* ---- Who it's for ---- */}
        <Card title="Who is it for?">
          <Picker
            name="student_id"
            label="Student"
            options={students}
            defaultValue={preselected}
            allowNone="No student — I’ll type the name myself"
            hint="Under-18s are billed to their main parent or guardian. You can change the name and address on the next page."
          />
        </Card>

        {/* ---- Lessons to bill ---- */}
        <Card title="Lessons">
          <div className="form">
            <Toggle
              name="include_lessons"
              label="Add this student’s lessons automatically"
              defaultChecked
              hint="Switch off to make an invoice just for equipment, books or other items."
            />
            <div className="form-grid">
              <TextField label="Lessons from" name="from" type="date" defaultValue={monthStart} />
              <TextField label="Lessons to" name="to" type="date" defaultValue={monthEnd} />
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              Every chargeable lesson in these dates that isn’t already on an invoice is added — including late cancellations you’ve marked as
              chargeable. You can add equipment and other items on the next page.
            </p>
          </div>
        </Card>

        {/* ---- Invoice date ---- */}
        <Card title="Invoice date">
          <div className="form-grid">
            <TextField
              label="Issue date"
              name="issue_date"
              type="date"
              defaultValue={today}
              hint={`Payment will be due ${teacher.invoice_terms_days} day${teacher.invoice_terms_days === 1 ? '' : 's'} later (change this in Settings).`}
            />
          </div>
        </Card>

        <div className="form-actions" style={{ marginTop: 20 }}>
          <SubmitButton pendingText="Creating…">Create invoice</SubmitButton>
          <Link href="/invoices" className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </ActionForm>
    </>
  )
}
