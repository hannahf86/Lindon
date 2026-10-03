'use server'
// =============================================================================
// contacts/actions.ts — create / update / delete parents & guardians, and
// link them to (or unlink them from) students. Every query is scoped to the
// signed-in teacher; composite foreign keys stop cross-teacher links.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { all, bool, handle, required, str, FormError, type ActionState } from '@/lib/forms'

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

/** Student ids ticked in a Picker (multiple) — uuid-checked. */
function studentIds(fd: FormData): string[] {
  const ids = all(fd, 'student_ids')
  if (ids.some((v) => !/^[0-9a-f-]{36}$/i.test(v))) throw new FormError('Invalid reference.')
  return ids
}

/** Write student_guardians rows for one contact and several students. */
async function writeLinks(teacherId: string, guardianId: string, ids: string[], fd: FormData) {
  if (ids.length === 0) return
  must(
    await db()
      .from('student_guardians')
      .upsert(
        ids.map((student_id) => ({
          teacher_id: teacherId,
          student_id,
          guardian_id: guardianId,
          relationship: str(fd, 'relationship'),
          is_primary: bool(fd, 'is_primary'),
          receives_emails: true,
        })),
      )
      .select('student_id'),
  )
}

// ---- Create ------------------------------------------------------------------------
export async function createGuardian(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = ''
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const ids = studentIds(fd)
    const row = must(await db().from('guardians').insert({ ...readGuardian(fd), teacher_id: teacher.id }).select('id').single())
    id = row.id
    await writeLinks(teacher.id, id, ids, fd)
  })
  if (result?.error) return result
  revalidatePath('/contacts')
  revalidatePath('/students', 'layout')
  redirect(`/contacts/${id}`)
}

// ---- Update ------------------------------------------------------------------------
export async function updateGuardian(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    must(await db().from('guardians').update(readGuardian(fd)).eq('id', id).eq('teacher_id', teacher.id).select('id').single())
    revalidatePath('/contacts')
    revalidatePath(`/contacts/${id}`)
    return { ok: 'Contact saved.' }
  })
}

// ---- Delete ------------------------------------------------------------------------
// Removes their links to students too (cascade). The students are untouched.
export async function deleteGuardian(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  must(await db().from('guardians').delete().eq('id', id).eq('teacher_id', teacher.id).select('id'))
  revalidatePath('/contacts')
  revalidatePath('/students', 'layout')
  redirect('/contacts')
}

// ---- Link to more students ---------------------------------------------------------
export async function linkStudents(guardianId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const ids = studentIds(fd)
    if (ids.length === 0) throw new FormError('Tick at least one student to link.')
    await writeLinks(teacher.id, guardianId, ids, fd)
    revalidatePath(`/contacts/${guardianId}`)
    revalidatePath('/contacts')
    revalidatePath('/students', 'layout')
    return { ok: ids.length === 1 ? 'Student linked.' : `${ids.length} students linked.` }
  })
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
  revalidatePath(`/contacts/${guardianId}`)
  revalidatePath('/contacts')
  revalidatePath(`/students/${studentId}`)
  return { ok: 'Unlinked.' }
}
