// =============================================================================
// lib/regular-lesson.ts — a pupil's regular lesson, from the fields in
// components/regular-lesson-fields.tsx (onboarding step 5 and the student
// add / edit form)
//
// readRegularLesson() — reads and checks the fields (inside teaching hours,
//   no clash) BEFORE anything is saved. Returns null when the time is left on
//   "Not yet", so the lesson can be booked later.
// bookRegularLesson() — saves it as a booking and makes the lessons.
// =============================================================================
import 'server-only'
import { db, must } from './db'
import { date, int, num, oneOf, parseTime, str, FormError } from './forms'
import { todayISO } from './dates'
import { alignToWeekday } from './lessons'
import { checkBooking } from './booking-check'
import { syncSlotLessons } from './bookings'
import { rememberLocation } from './locations'
import type { Teacher } from './database.types'

const DAYS = ['1', '2', '3', '4', '5', '6', '7'] as const
const REPEATS = ['1', '2', '3', '4'] as const

export type RegularLesson = {
  day_of_week: number
  start_time: string
  duration_minutes: number
  price: number
  repeat_weeks: number
  starts_on: string
  ends_on: string | null
  skip_dates: string[]
  location: string
}

export async function readRegularLesson(fd: FormData, teacher: Teacher): Promise<RegularLesson | null> {
  const rawTime = str(fd, 'lesson_time')
  if (!rawTime) return null
  const day_of_week = Number(oneOf(fd, 'lesson_day', DAYS, '1'))
  const starts_on = alignToWeekday(date(fd, 'first_lesson') ?? todayISO(teacher.timezone), day_of_week)
  const ends_on = str(fd, 'ends') === 'date' ? date(fd, 'ends_on') : null
  if (str(fd, 'ends') === 'date' && !ends_on) throw new FormError('Pick the date of their last lesson — or choose “Keeps going”.')
  if (ends_on && ends_on < starts_on) throw new FormError('The last lesson is before the first lesson.')
  const lesson: RegularLesson = {
    day_of_week,
    start_time: parseTime(rawTime, 'Lesson time').slice(0, 5),
    duration_minutes: int(fd, 'duration_minutes', 'Lesson length', { min: 5, max: 600 }),
    price: num(fd, 'price', 'Price', { min: 0, fallback: 0 }),
    repeat_weeks: Number(oneOf(fd, 'repeat_weeks', REPEATS, '1')),
    starts_on,
    ends_on,
    skip_dates: [],
    location: str(fd, 'lesson_location'),
  }
  // Inside teaching hours, and not clashing with another pupil
  await checkBooking(teacher, lesson)
  return lesson
}

export async function bookRegularLesson(teacher: Teacher, studentId: string, lesson: RegularLesson, instrument: string): Promise<void> {
  await rememberLocation(teacher, lesson.location)
  const slot = must(
    await db()
      .from('time_slots')
      .insert({ ...lesson, teacher_id: teacher.id, student_id: studentId, instrument, active: true })
      .select('*')
      .single(),
  )
  await syncSlotLessons(teacher, slot, slot.starts_on ?? undefined)
}
