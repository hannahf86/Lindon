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
import { bookRegularLesson, readRegularLesson } from '@/lib/regular-lesson'
import { refreshBillTo } from '@/lib/invoice-contacts'

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

// ---- Parents on the student form ---------------------------------------------------------
// The form sends numbered sets: parent_0_first_name, parent_0_email … For a
// parent already linked, parent_N_id says which one (editing them updates
// that contact — shared with any brothers or sisters). A set with no id is a
// new parent; left blank, it's ignored. Everything is checked BEFORE saving.
const MAX_PARENT_SETS = 6
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ParentInput = { id: string | null; first_name: string; last_name: string; email: string; phone: string; relationship: string }

function readParents(fd: FormData): ParentInput[] {
  const out: ParentInput[] = []
  for (let i = 0; i < MAX_PARENT_SETS; i++) {
    const k = (f: string) => `parent_${i}_${f}`
    if (!fd.has(k('first_name'))) continue
    const p: ParentInput = {
      id: ref(fd, k('id')),
      first_name: str(fd, k('first_name')),
      last_name: str(fd, k('last_name')),
      email: str(fd, k('email')).toLowerCase(),
      phone: str(fd, k('phone')),
      relationship: str(fd, k('relationship')),
    }
    const blank = !p.first_name && !p.last_name && !p.email && !p.phone && !p.relationship
    if (!p.id && blank) continue
    if (!p.first_name) throw new FormError('Each parent or guardian needs a first name — reminders and invoices for children go to them.')
    if (!p.email && !p.phone) throw new FormError(`Add an email or phone number for ${p.first_name} so you can reach them.`)
    if (p.email && !EMAIL_RE.test(p.email)) throw new FormError(`"${p.email}" doesn’t look like an email address.`)
    out.push(p)
  }
  return out
}

/** Save the parents for a student: update linked ones, add/link new ones. */
async function saveParents(teacherId: string, studentId: string, parents: ParentInput[], hasPrimary: boolean) {
  let primaryTaken = hasPrimary
  for (const p of parents) {
    const contact = { first_name: p.first_name, last_name: p.last_name, email: p.email, phone: p.phone }
    if (p.id) {
      // Only parents actually linked to this student can be edited from here
      must(await db().from('student_guardians').update({ relationship: p.relationship }).eq('teacher_id', teacherId).eq('student_id', studentId).eq('guardian_id', p.id).select('guardian_id').single())
      must(await db().from('guardians').update(contact).eq('id', p.id).eq('teacher_id', teacherId).select('id').single())
      continue
    }
    // New parent. Brothers and sisters: one already on file with the same email is reused
    const { data: existing } = p.email
      ? await db().from('guardians').select('id').eq('teacher_id', teacherId).ilike('email', p.email.replace(/[%_\\]/g, '\\$&')).limit(1).maybeSingle()
      : { data: null }
    const guardianId = existing?.id ?? must(await db().from('guardians').insert({ ...contact, teacher_id: teacherId }).select('id').single()).id
    must(
      await db()
        .from('student_guardians')
        .upsert({ teacher_id: teacherId, student_id: studentId, guardian_id: guardianId, relationship: p.relationship, is_primary: !primaryTaken, receives_emails: true })
        .select('student_id'),
    )
    primaryTaken = true
  }
}

// ---- Create (children: their parent too, on the same form) -----------------------------
export async function createStudent(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = ''
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const student = readStudent(fd)
    const parents = student.is_minor ? readParents(fd) : []
    if (student.is_minor && parents.length === 0) throw new FormError('Add a parent or guardian — reminders and invoices for children go to them.')
    // Their regular lesson (optional) — checked against teaching hours and clashes first
    const lesson = await readRegularLesson(fd, teacher)
    const row = must(await db().from('students').insert({ ...student, teacher_id: teacher.id }).select('id').single())
    id = row.id
    await saveParents(teacher.id, id, parents, false)
    if (lesson) await bookRegularLesson(teacher, id, lesson, student.instruments[0] ?? '')
  })
  if (result?.error) return result
  revalidatePath('/students')
  revalidatePath('/schedule', 'layout')
  redirect(`/students/${id}?new=1`)
}

// ---- Update (children: edit their parents, or add one, on the same form) -----------------
export async function updateStudent(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const student = readStudent(fd)
    const parents = student.is_minor ? readParents(fd) : []
    // Only sent when they had no regular lesson yet
    const lesson = await readRegularLesson(fd, teacher)
    must(await db().from('students').update(student).eq('id', id).eq('teacher_id', teacher.id).select('id').single())
    if (lesson) await bookRegularLesson(teacher, id, lesson, student.instruments[0] ?? '')
    if (parents.length) {
      const { count } = await db().from('student_guardians').select('guardian_id', { count: 'exact', head: true }).eq('teacher_id', teacher.id).eq('student_id', id).eq('is_primary', true)
      await saveParents(teacher.id, id, parents, (count ?? 0) > 0)
    }
    // Unpaid invoices follow any change to the pupil's or parents' details
    await refreshBillTo(teacher.id, [id])
  })
  if (result?.error) return result
  revalidatePath('/students')
  revalidatePath('/invoices', 'layout')
  revalidatePath(`/students/${id}`)
  revalidatePath('/schedule', 'layout')
  redirect(`/students/${id}`)
}

// ---- Delete ------------------------------------------------------------------------
// Deleting a pupil removes EVERYTHING about them (Hannah's call): their
// invoices (all of them, paid included — with their lines) are deleted first,
// then the pupil, which cascades to lessons, bookings, loans, exams, credits
// and parent links. Archiving (status Paused / Past) keeps it all.
export async function deleteStudent(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  must(await db().from('invoices').delete().eq('teacher_id', teacher.id).eq('student_id', id).select('id'))
  must(await db().from('students').delete().eq('id', id).eq('teacher_id', teacher.id).select('id'))
  revalidatePath('/invoices', 'layout')
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
