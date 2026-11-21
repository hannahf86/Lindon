'use server'
// =============================================================================
// welcome/actions.ts — the onboarding steps (see welcome/page.tsx)
//
//   1 saveDetails   — name, studio, reply email, phone + a password
//   2 saveCharging  — in advance / arrears, auto-invoicing, terms, how to pay
//   3 saveFeatures  — lesson reminders + optional features
//   4 addSlot / removeSlot       — the weekly timetable (free slots)
//   5 addStudent                 — first pupils (+ a parent for children)
//   6 finishOnboarding           — marks onboarding done, opens the dashboard
// Each save moves on to the next step. Everything is the signed-in teacher's
// own data; ids from forms are re-checked against teacher_id.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { handle, int, num, oneOf, parseTime, required, str, FormError, type ActionState } from '@/lib/forms'
import { splitList } from '@/lib/format'
import { readChargingFields, readFeatureToggles } from '@/lib/feature-form'
import { hasPassword, MIN_PASSWORD_LENGTH, setPassword } from '@/lib/passwords'

const EMAIL = /^\S+@\S+\.\S+$/

// ---- 1. You & your studio (+ password) ---------------------------------------------------
export async function saveDetails(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const email = str(fd, 'email')
    if (email && !EMAIL.test(email)) throw new FormError(`"${email}" doesn't look like an email address.`)

    // Password: required the first time, optional (blank = keep) once one is set
    const password = String(fd.get('password') ?? '') // exactly as typed — spaces count
    const already = await hasPassword(teacher.id)
    if (password || !already) {
      if (password.length < MIN_PASSWORD_LENGTH) throw new FormError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`)
      if (password.length > 200) throw new FormError('That password is too long.')
      if (password !== String(fd.get('confirm') ?? '')) throw new FormError('The two passwords don’t match.')
    }

    must(
      await db()
        .from('teachers')
        .update({ display_name: required(fd, 'display_name', 'Your name'), business_name: str(fd, 'business_name'), email, phone: str(fd, 'phone') })
        .eq('id', teacher.id)
        .select('id')
        .single(),
    )
    if (password) await setPassword(teacher.id, password)
  })
  if (result?.error) return result
  redirect('/welcome?step=2')
}

// ---- 2. How you charge & get paid -----------------------------------------------------------
export async function saveCharging(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    must(
      await db()
        .from('teachers')
        .update({
          ...readChargingFields(fd),
          invoice_terms_days: int(fd, 'invoice_terms_days', 'Payment terms', { min: 0, max: 365, fallback: 14 }),
          payment_details: str(fd, 'payment_details'),
        })
        .eq('id', teacher.id)
        .select('id')
        .single(),
    )
  })
  if (result?.error) return result
  redirect('/welcome?step=3')
}

// ---- 3. Reminders & features -------------------------------------------------------------------
export async function saveFeatures(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    must(await db().from('teachers').update(readFeatureToggles(fd)).eq('id', teacher.id).select('id').single())
  })
  if (result?.error) return result
  redirect('/welcome?step=4')
}

// ---- 4. Timetable: free weekly slots --------------------------------------------------------------
const DAYS = ['1', '2', '3', '4', '5', '6', '7'] as const

export async function addSlot(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    must(
      await db()
        .from('time_slots')
        .insert({
          teacher_id: teacher.id,
          day_of_week: Number(oneOf(fd, 'day_of_week', DAYS, '1')),
          start_time: parseTime(required(fd, 'start_time', 'Start time'), 'Start time'),
          duration_minutes: int(fd, 'duration_minutes', 'Lesson length', { min: 5, max: 600 }),
          price: num(fd, 'price', 'Price', { min: 0, fallback: 0 }),
          label: str(fd, 'label'),
          active: true,
        })
        .select('id'),
    )
    revalidatePath('/welcome')
    return { ok: 'Slot added. Add another, or carry on.' }
  })
}

export async function removeSlot(id: string): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    // Only an unbooked slot — booked ones are managed from Schedule
    must(await db().from('time_slots').delete().eq('id', id).eq('teacher_id', teacher.id).is('student_id', null).select('id'))
    revalidatePath('/welcome')
    return null
  })
}

// ---- 5. First students (+ a parent for children) ------------------------------------------------
export async function addStudent(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const child = str(fd, 'age_group') !== 'adult'
    const email = str(fd, child ? 'parent_email' : 'email')
    if (email && !EMAIL.test(email)) throw new FormError(`"${email}" doesn't look like an email address.`)
    const parentFirst = str(fd, 'parent_first_name')
    if (child && !parentFirst) throw new FormError('Add a parent or guardian’s name — reminders and invoices for children go to them.')

    const student = must(
      await db()
        .from('students')
        .insert({
          teacher_id: teacher.id,
          first_name: required(fd, 'first_name', 'First name'),
          last_name: str(fd, 'last_name'),
          is_minor: child,
          email: child ? '' : email,
          instruments: splitList(str(fd, 'instruments')),
          status: 'active',
          reminders_enabled: true,
        })
        .select('id, first_name')
        .single(),
    )

    if (child) {
      const parent = must(
        await db()
          .from('guardians')
          .insert({ teacher_id: teacher.id, first_name: parentFirst, last_name: str(fd, 'parent_last_name'), email })
          .select('id')
          .single(),
      )
      must(
        await db()
          .from('student_guardians')
          .insert({ teacher_id: teacher.id, student_id: student.id, guardian_id: parent.id, is_primary: true, receives_emails: true })
          .select('student_id'),
      )
    }
    revalidatePath('/welcome')
    return { ok: `${student.first_name} added. Add another, or carry on.` }
  })
}

// ---- 6. Done ----------------------------------------------------------------------------------------
export async function finishOnboarding(): Promise<ActionState> {
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    must(await db().from('teachers').update({ onboarded_at: new Date().toISOString() }).eq('id', teacher.id).select('id').single())
  })
  if (result?.error) return result
  revalidatePath('/', 'layout')
  redirect('/')
}
