// =============================================================================
// lib/invoice-contacts.ts — keep unpaid invoices' "bill to" in step with
// contact details
//
// An invoice copies who it's for (name, email, address) when it's made. If a
// parent's or adult pupil's details change afterwards, refreshBillTo() puts
// the new details on that pupil's DRAFT and SENT (unpaid) invoices, so the
// next email / reminder goes to the right place. Paid and void invoices are
// a record and are never changed. Called after saving a parent or a pupil.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { billToFor } from './invoices'

/** Refresh unpaid invoices for these pupils (e.g. everyone linked to a parent). */
export async function refreshBillTo(teacherId: string, studentIds: string[]): Promise<number> {
  let changed = 0
  for (const studentId of new Set(studentIds)) {
    const billTo = await billToFor(teacherId, studentId)
    if (!billTo) continue
    const rows = must(
      await db()
        .from('invoices')
        .update({ bill_to_name: billTo.name, bill_to_email: billTo.email, bill_to_address: billTo.address })
        .eq('teacher_id', teacherId)
        .eq('student_id', studentId)
        .in('status', ['draft', 'sent'])
        .select('id'),
    )
    changed += rows.length
  }
  return changed
}

/** The pupils a parent is linked to. */
export async function studentsOfGuardian(teacherId: string, guardianId: string): Promise<string[]> {
  const links = must(await db().from('student_guardians').select('student_id').eq('teacher_id', teacherId).eq('guardian_id', guardianId))
  return links.map((l) => l.student_id)
}
