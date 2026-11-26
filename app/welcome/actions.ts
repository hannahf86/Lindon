'use server'
// =============================================================================
// welcome/actions.ts — the onboarding steps (see welcome/page.tsx)
//
//   1 saveDetails   — name, studio, reply email, phone + a password
//   2 saveCharging  — in advance / arrears, auto-invoicing, terms, how to pay
//   3 saveFeatures  — lesson reminders + optional features
//   4 (teaching hours — schedule/hours/actions.ts, shared with Schedule)
//   5 addStudent                 — first pupils (+ a parent for children), each
//                                  with their regular lesson (day, time, length,
//                                  price, how often, start and optional end)
//   6 finishOnboarding           — marks onboarding done, opens the dashboard
// Each save moves on to the next step. Everything is the signed-in teacher's
// own data; ids from forms are re-checked against teacher_id.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { date, handle, int, num, oneOf, parseTime, required, str, FormError, type ActionState } from '@/lib/forms'
import { splitList } from '@/lib/format'
import { readChargingFields, readFeatureToggles } from '@/lib/feature-form'
import { hasPassword, MIN_PASSWORD_LENGTH, setPassword } from '@/lib/passwords'
import { todayISO } from '@/lib/dates'
import { alignToWeekday } from '@/lib/lessons'
import { checkBooking } from '@/lib/booking-check'
import { syncSlotLessons } from '@/lib/bookings'

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

const DAYS = ['1', '2', '3', '4', '5', '6', '7'] as const
const REPEATS = ['1', '2', '3', '4'] as const

// ---- 5. First students (+ a parent for children) ------------------------------------------------
export async function addStudent(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const child = str(fd, 'age_group') !== 'adult'
    const email = str(fd, child ? 'parent_email' : 'email')
    if (email && !EMAIL.test(email)) throw new FormError(`"${email}" doesn't look like an email address.`)
    const parentFirst = str(fd, 'parent_first_name')
    if (child && !parentFirst) throw new FormError('Add a parent or guardian’s name — reminders and invoices for children go to them.')
    const instruments = splitList(str(fd, 'instruments'))

    // ---- Their regular lesson (optional: leave the time empty to book later) ----
    const rawTime = str(fd, 'lesson_time')
    let lesson: {
      day_of_week: number
      start_time: string
      duration_minutes: number
      price: number
      repeat_weeks: number
      starts_on: string
      ends_on: string | null
      skip_dates: string[]
    } | null = null
    if (rawTime) {
      const day_of_week = Number(oneOf(fd, 'lesson_day', DAYS, '1'))
      const starts_on = alignToWeekday(date(fd, 'first_lesson') ?? todayISO(teacher.timezone), day_of_week)
      const ends_on = str(fd, 'ends') === 'date' ? date(fd, 'ends_on') : null
      if (str(fd, 'ends') === 'date' && !ends_on) throw new FormError('Pick the date of their last lesson — or choose “Keeps going”.')
      if (ends_on && ends_on < starts_on) throw new FormError('The last lesson is before the first lesson.')
      lesson = {
        day_of_week,
        start_time: parseTime(rawTime, 'Lesson time').slice(0, 5),
        duration_minutes: int(fd, 'duration_minutes', 'Lesson length', { min: 5, max: 600 }),
        price: num(fd, 'price', 'Price', { min: 0, fallback: 0 }),
        repeat_weeks: Number(oneOf(fd, 'repeat_weeks', REPEATS, '1')),
        starts_on,
        ends_on,
        skip_dates: [],
      }
      // Inside teaching hours, and not clashing with another pupil — before anything is saved
      await checkBooking(teacher, lesson)
    }

    const student = must(
      await db()
        .from('students')
        .insert({
          teacher_id: teacher.id,
          first_name: required(fd, 'first_name', 'First name'),
          last_name: str(fd, 'last_name'),
          is_minor: child,
          email: child ? '' : email,
          instruments,
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
    // ---- Book their regular lesson and make the lessons ----
    if (lesson) {
      const slot = must(
        await db()
          .from('time_slots')
          .insert({ ...lesson, teacher_id: teacher.id, student_id: student.id, instrument: instruments[0] ?? '', active: true })
          .select('*')
          .single(),
      )
      await syncSlotLessons(teacher, slot, slot.starts_on ?? undefined)
    }
    revalidatePath('/welcome')
    revalidatePath('/schedule', 'layout')
    return { ok: `${student.first_name} added${lesson ? ' and booked in' : ''}. Add another, or carry on.` }
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
