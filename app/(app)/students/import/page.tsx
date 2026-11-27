// =============================================================================
// students/import/page.tsx — Import students from a spreadsheet (CSV)
//
// Left: how it works + the template to download. Right: pick the file, see a
// row-by-row check (added / already here / needs fixing), then import.
// =============================================================================
import type { Metadata } from 'next'
import { requireTeacher } from '@/lib/db'
import { MAX_IMPORT_ROWS } from '@/lib/student-import'
import { Card, PageHeader } from '@/components/ui'
import { StudentImporter } from './importer'

export const metadata: Metadata = { title: 'Import students' }

export default async function ImportStudentsPage() {
  await requireTeacher()
  return (
    <>
      <PageHeader title="Import students" back={{ href: '/students', label: 'Students' }} subtitle="Bring your pupils over from a spreadsheet or your old system." />
      <div className="import-grid">
        {/* ---- How it works ---- */}
        <Card title="How it works">
          <ol className="import-steps">
            <li>
              <strong>Get a CSV file.</strong> Download our template and fill it in, or export your pupils from your old system or spreadsheet
              (in Excel or Google Sheets: <em>File → Save as / Download → CSV</em>).
            </li>
            <li>
              <strong>One pupil per row</strong>, with headings in the first row. Only <em>First name</em> is required — the rest is optional.
            </li>
            <li>
              <strong>Children need a parent or guardian</strong> with an email or phone number. Pupils with no parent are added as adults, or put
              Yes in the <em>Adult</em> column.
            </li>
            <li>
              <strong>Check, then import.</strong> You’ll see every row before anything is added. Pupils already on Lindon are skipped.
            </li>
          </ol>
          <a href="/students/import/template" className="btn btn-secondary" download>
            Download the template
          </a>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Columns Lindon understands: first name, last name (or one “name” column), date of birth, adult, email, phone, address, instruments,
            level, status (Active, Paused or Past), start date, notes, parent first name, parent last name (or “parent name”), parent email, parent
            phone and relationship. Dates can be 21/03/2014. Up to {MAX_IMPORT_ROWS} pupils at a time. Regular lessons aren’t imported — book
            those from each pupil’s page afterwards.
          </p>
        </Card>

        {/* ---- Upload + check + import ---- */}
        <StudentImporter />
      </div>
    </>
  )
}
