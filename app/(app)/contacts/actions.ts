'use server'
// =============================================================================
// contacts/actions.ts — update / delete parents & guardians, and link them to
// (or unlink them from) students. Parents are managed from each student's page
// (students/[id]); adding a new one lives in students/actions.ts. Every query is scoped to the
// signed-in teacher; composite foreign keys stop cross-teacher links.
// =============================================================================
import { refreshBillTo, studentsOfGuardian } from '@/lib/invoice-contacts'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { handle, required, str, FormError, type ActionState } from '@/lib/forms'

/** Read the contact form into a row (shared by create + update). */
function readGuardian(fd: FormData) {
  const email = str(fd, 'email')
  const phone = str(fd, 'phone')
  if (!email && !phone) throw new FormError('Add an email or phone number so you can reach them.')
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new FormError(`"${email}" doesn't look like an email address.`)
  return {
    first_name: required(fd, 'first_name', 'First name'),
    last_name: str(fd, 'last_name'),
    email,
    phone,
    address: str(fd, 'address'),
    notes: str(fd, 'notes'),
  }
}

// ---- Update ------------------------------------------------------------------------
export async function updateGuardian(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    must(await db().from('guardians').update(readGuardian(fd)).eq('id', id).eq('teacher_id', teacher.id).select('id').single())
    // Unpaid invoices follow the new name / email / address
    await refreshBillTo(teacher.id, await studentsOfGuardian(teacher.id, id))
    revalidatePath('/students', 'layout')
    revalidatePath('/invoices', 'layout')
    return { ok: 'Contact saved.' }
  })
}

// ---- Delete ------------------------------------------------------------------------
// Removes their links to students too (cascade). The students are untouched.
export async function deleteGuardian(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  must(await db().from('guardians').delete().eq('id', id).eq('teacher_id', teacher.id).select('id'))
  revalidatePath('/students', 'layout')
  return { ok: 'Contact deleted.' }
}

// ---- Unlink one student ---------------------------------------------------------------
export async function unlinkStudent(guardianId: string, studentId: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  must(
    await db()
      .from('student_guardians')
      .delete()
      .eq('teacher_id', teacher.id)
      .eq('guardian_id', guardianId)
      .eq('student_id', studentId)
      .select('student_id'),
  )
  revalidatePath(`/students/${studentId}`)
  return { ok: 'Unlinked.' }
}
