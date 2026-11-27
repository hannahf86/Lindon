// =============================================================================
// students/import/template/route.ts — the CSV template to fill in
// Two example rows: a child with a parent, and an adult pupil.
// =============================================================================
import { requireTeacher } from '@/lib/db'
import { templateCsv } from '@/lib/student-import'

export async function GET() {
  await requireTeacher()
  return new Response(templateCsv(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="lindon-students-template.csv"',
    },
  })
}
