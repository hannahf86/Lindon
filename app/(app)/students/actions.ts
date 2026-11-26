'use server'
// =============================================================================
// students/actions.ts — create / update / delete students, and link them to
// parents & guardians. Every query is scoped to the signed-in teacher.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { bool, date, handle, num, oneOf, ref, required, str, FormError, type ActionState } from '@/lib/forms'
import { ageFrom, splitList } from '@/lib/format'

const STATUSES = ['active', 'paused', 'left'] as const

/** Read the student form into a row (shared by create + update). */
function readStudent(fd: FormData) {
  const date_of_birth = date(fd, 'date_of_birth')
  const age = ageFrom(date_of_birth)
  if (age !== null && (age < 0 || age > 120)) throw new FormError('Date of birth looks wrong.')
  return {
    first_name: required(fd, 'first_name', 'First name'),
    last_name: str(fd, 'last_name'),
    date_of_birth,
    // DOB decides when present; otherwise the teacher's choice
    is_minor: age !== null ? age < 18 : str(fd, 'age_group') !== 'adult',
    email: str(fd, 'email'),
    phone: str(fd, 'phone'),
    address: str(fd, 'address'),
    instruments: splitList(str(fd, 'instruments')),
    level: str(fd, 'level'),
    status: oneOf(fd, 'status', STATUSES, 'active'),
    start_date: date(fd, 'start_date'),
    reminders_enabled: bool(fd, 'reminders_enabled'),
    notes: str(fd, 'notes'),
  }
}

/**
 * The new-student form's parent fields (children only). Checked BEFORE the
 * student is saved, so a mistake here doesn't leave a child with no parent.
 */
function readParent(fd: FormData) {
  const first_name = str(fd, 'parent_first_name')
  const email = str(fd, 'parent_email').toLowerCase()
  const phone = str(fd, 'parent_phone')
  if (!first_name) throw new FormError('Add a parent or guardian’s first name — reminders and invoices for children go to them.')
  if (!email && !phone) throw new FormError('Add the parent’s email or phone number so you can reach them.')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FormError(`"${email}" doesn’t look like an email address.`)
  return { first_name, last_name: str(fd, 'parent_last_name'), email, phone, relationship: str(fd, 'parent_relationship') }
}

// ---- Create (children: their parent too, on the same form) -----------------------------
export async function createStudent(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = ''
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const student = readStudent(fd)
    const parent = student.is_minor ? readParent(fd) : null
    const row = must(await db().from('students').insert({ ...student, teacher_id: teacher.id }).select('id').single())
    id = row.id

    if (parent) {
      // Siblings: a parent already on file with the same email is reused, not duplicated
      const { data: existing } = parent.email
        ? await db().from('guardians').select('id').eq('teacher_id', teacher.id).ilike('email', parent.email.replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle()
        : { data: null }
      const guardianId =
        existing?.id ??
        must(
          await db()
            .from('guardians')
            .insert({ teacher_id: teacher.id, first_name: parent.first_name, last_name: parent.last_name, email: parent.email, phone: parent.phone })
            .select('id')
            .single(),
        ).id
      must(
        await db()
          .from('student_guardians')
          .insert({ teacher_id: teacher.id, student_id: id, guardian_id: guardianId, relationship: parent.relationship, is_primary: true, receives_emails: true })
          .select('student_id'),
      )
    }
  })
  if (result?.error) return result
  revalidatePath('/students')
  redirect(`/students/${id}?new=1`)
}

// ---- Update ------------------------------------------------------------------------
export async function updateStudent(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    must(await db().from('students').update(readStudent(fd)).eq('id', id).eq('teacher_id', teacher.id).select('id').single())
  })
  if (result?.error) return result
  revalidatePath('/students')
  redirect(`/students/${id}`)
}

// ---- Delete ------------------------------------------------------------------------
// Cascades to their lessons, loans, exams and guardian links. Invoices are
// kept (bill-to name is stored on the invoice) so income reports stay right.
export async function deleteStudent(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  must(await db().from('students').delete().eq('id', id).eq('teacher_id', teacher.id).select('id'))
  revalidatePath('/students')
  redirect('/students')
}

// ---- Link an existing guardian -----------------------------------------------------
export async function linkGuardian(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const guardianId = ref(fd, 'guardian_id')
    if (!guardianId) throw new FormError('Choose a contact to link.')
    // Composite FKs reject guardians/students belonging to another teacher
    must(
      await db()
        .from('student_guardians')
        .upsert({
          teacher_id: teacher.id,
          student_id: studentId,
          guardian_id: guardianId,
          relationship: str(fd, 'relationship'),
          is_primary: bool(fd, 'is_primary'),
          receives_emails: true,
        })
        .select('student_id'),
    )
    revalidatePath(`/students/${studentId}`)
    return { ok: 'Contact linked.' }
  })
}

// ---- Create a new guardian and link them in one go -------------------------------
export async function addGuardian(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const email = str(fd, 'email')
    const phone = str(fd, 'phone')
    if (!email && !phone) throw new FormError('Add an email or phone number so you can reach them.')
    const g = must(
      await db()
        .from('guardians')
        .insert({ teacher_id: teacher.id, first_name: required(fd, 'first_name', 'First name'), last_name: str(fd, 'last_name'), email, phone })
        .select('id')
        .single(),
    )
    must(
      await db()
        .from('student_guardians')
        .insert({
          teacher_id: teacher.id,
          student_id: studentId,
          guardian_id: g.id,
          relationship: str(fd, 'relationship'),
          is_primary: bool(fd, 'is_primary'),
        })
        .select('student_id'),
    )
    revalidatePath(`/students/${studentId}`)
    return { ok: 'Contact added and linked.' }
  })
}

// ---- Change a link (emails on/off) or remove it ----------------------------------
export async function toggleGuardianEmails(studentId: string, guardianId: string, on: boolean): Promise<ActionState> {
  const teacher = await requireTeacher()
  must(
    await db()
      .from('student_guardians')
      .update({ receives_emails: on })
      .eq('teacher_id', teacher.id)
      .eq('student_id', studentId)
      .eq('guardian_id', guardianId)
      .select('student_id'),
  )
  revalidatePath(`/students/${studentId}`)
  return null
}

export async function unlinkGuardian(studentId: string, guardianId: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  must(
    await db()
      .from('student_guardians')
      .delete()
      .eq('teacher_id', teacher.id)
      .eq('student_id', studentId)
      .eq('guardian_id', guardianId)
      .select('student_id'),
  )
  revalidatePath(`/students/${studentId}`)
  return { ok: 'Unlinked.' }
}

// ---- Make-up credits: add a goodwill credit by hand, or remove an unused one ------
// (Credits for cancelled lessons are created automatically from attendance.)
export async function addManualCredit(studentId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const amount = num(fd, 'amount', 'Amount', { min: 0.01 })
    must(
      await db()
        .from('lesson_credits')
        .insert({ teacher_id: teacher.id, student_id: studentId, amount, reason: 'manual', note: str(fd, 'note') })
        .select('id'),
    )
    revalidatePath(`/students/${studentId}`)
    return { ok: 'Credit added — it will come off their next invoice.' }
  })
}

export async function removeCredit(studentId: string, creditId: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  // Only unused, hand-added credits can be removed (lesson credits follow attendance)
  must(
    await db()
      .from('lesson_credits')
      .delete()
      .eq('id', creditId)
      .eq('teacher_id', teacher.id)
      .eq('student_id', studentId)
      .eq('reason', 'manual')
      .is('invoice_item_id', null)
      .select('id'),
  )
  revalidatePath(`/students/${studentId}`)
  return { ok: 'Credit removed.' }
}
