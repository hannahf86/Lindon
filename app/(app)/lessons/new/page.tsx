// =============================================================================
// lessons/new/page.tsx — add a one-off lesson (extra lesson, catch-up, trial)
// /lessons/new?student=<id> preselects the student and borrows the length,
// price, instrument and location from their weekly slot if they have one.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { db, requireTeacher } from '@/lib/db'
import { fullName } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { currencySymbol } from '@/lib/lessons'
import { distinctValues, instrumentSuggestions, studentOptions } from '@/lib/queries'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Picker } from '@/components/pickers'
import { Card, PageHeader } from '@/components/ui'
import { LessonFields, type LessonDefaults } from '../lesson-fields'
import { createLesson } from '../actions'

export const metadata: Metadata = { title: 'One-off lesson' }

export default async function NewLessonPage({ searchParams }: PageProps<'/lessons/new'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const t = teacher.id
  const studentId = typeof sp.student === 'string' && /^[0-9a-f-]{36}$/i.test(sp.student) ? sp.student : null

  const [students, instruments, locations, student, slot] = await Promise.all([
    studentOptions(t),
    instrumentSuggestions(t),
    distinctValues(t, 'lessons', 'location'),
    studentId
      ? db().from('students').select('id, first_name, last_name, instruments').eq('id', studentId).eq('teacher_id', t).maybeSingle().then((r) => r.data)
      : null,
    studentId
      ? db()
          .from('time_slots')
          .select('duration_minutes, price, instrument, location')
          .eq('teacher_id', t)
          .eq('student_id', studentId)
          .eq('active', true)
          .order('day_of_week')
          .limit(1)
          .maybeSingle()
          .then((r) => r.data)
      : null,
  ])

  // Sensible starting values: their usual slot, else their first instrument
  const defaults: LessonDefaults = {
    date: todayISO(teacher.timezone),
    duration_minutes: slot?.duration_minutes,
    price: slot?.price,
    instrument: slot?.instrument || student?.instruments[0] || '',
    location: slot?.location ?? '',
  }
  const back = student ? { href: `/students/${student.id}`, label: fullName(student) } : { href: '/lessons', label: 'Lessons' }

  return (
    <>
      <PageHeader title="Add a one-off lesson" subtitle="For extra lessons, catch-ups and trials. Regular weekly lessons come from your time slots." back={back} />
      <ActionForm action={createLesson}>
        {/* ---- Student ---- */}
        <Card title="Student">
          <Picker name="student_id" label="Who is the lesson for?" options={students} defaultValue={student?.id ?? null} />
        </Card>

        {/* ---- Lesson details ---- */}
        <Card title="Lesson">
          <div className="form">
            <LessonFields
              timeZone={teacher.timezone}
              defaults={defaults}
              currencySymbol={currencySymbol(teacher.currency)}
              instrumentSuggestions={instruments}
              locationSuggestions={locations}
            />
          </div>
        </Card>

        <div className="form-actions">
          <SubmitButton>Add lesson</SubmitButton>
          <Link href={back.href} className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </ActionForm>
    </>
  )
}
