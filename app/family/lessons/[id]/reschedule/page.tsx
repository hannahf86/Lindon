// =============================================================================
// family/lessons/[id]/reschedule/page.tsx — pick a new time for a lesson
//
// Top: the lesson being moved and what it means for charging (24h rule —
// lib/family-booking.ts). Then the teacher's free times over the next two
// weeks for a lesson of the SAME length, day by day, as buttons. Choosing
// one shows a confirm box with an optional note. A different length means
// contacting the teacher. Only the family's own pupils' lessons open here.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { canSeePupil, requireFamily, teacherName } from '@/lib/family'
import { fmtDate, fmtTz } from '@/lib/dates'
import { duration, fullName } from '@/lib/format'
import { freeStartTimes, isLateNotice } from '@/lib/family-booking'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { RescheduleChooser } from './chooser'

export const metadata: Metadata = { title: 'Reschedule a lesson' }

export default async function ReschedulePage({ params }: PageProps<'/family/lessons/[id]/reschedule'>) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const ctx = await requireFamily()
  const { data: lesson } = await db().from('lessons').select('id, teacher_id, student_id, starts_at, duration_minutes, status, students(first_name, last_name)').eq('id', id).maybeSingle()
  if (!lesson || !canSeePupil(ctx, lesson.teacher_id, lesson.student_id)) notFound()
  const link = ctx.links.find((l) => l.teacher.id === lesson.teacher_id)!
  const teacher = link.teacher
  const tz = teacher.timezone
  const open = lesson.status === 'scheduled' && new Date(lesson.starts_at) > new Date()
  const late = isLateNotice(lesson.starts_at)
  const days = open ? await freeStartTimes(teacher, lesson.duration_minutes, lesson.id) : []

  return (
    <>
      <PageHeader title="Reschedule a lesson" back={{ href: '/family/lessons', label: 'Lessons' }} />

      {/* ---- The lesson + what it costs to move ---- */}
      <Card>
        <strong>{fullName(lesson.students)}</strong>
        <div>
          {fmtTz(lesson.starts_at, tz, "EEEE d MMMM 'at' HH:mm")} · {duration(lesson.duration_minutes)}
        </div>
        {open && (
          <div className={`alert ${late ? 'alert-error' : 'alert-ok'}`} style={{ marginTop: 12, marginBottom: 0 }}>
            {late
              ? 'This lesson is less than 24 hours away, so you’ll still be charged for it. A new time is booked as an extra lesson at the usual price.'
              : 'You won’t be charged for the original lesson — it simply moves to the new time.'}
          </div>
        )}
      </Card>

      {/* ---- Free times ---- */}
      <div style={{ marginTop: 20 }}>
        {!open ? (
          <Card>
            <EmptyState title="This lesson can’t be moved">It has already happened or been changed.</EmptyState>
          </Card>
        ) : days.length === 0 ? (
          <Card>
            <EmptyState title="No free times in the next two weeks">
              Please message {teacherName(teacher)}
              {teacher.email ? ` (${teacher.email})` : ''} to arrange another time.
            </EmptyState>
          </Card>
        ) : (
          <Card title="Choose a new time">
            <p className="small muted" style={{ marginTop: 0 }}>
              {teacherName(teacher)}’s free times for a {duration(lesson.duration_minutes)} lesson over the next two weeks. Need a later date, or a longer or shorter lesson? Message {teacherName(teacher)} instead.
            </p>
            <RescheduleChooser lessonId={lesson.id} late={late} days={days.map((d) => ({ ...d, label: fmtDate(d.date, 'EEEE d MMMM') }))} />
          </Card>
        )}
      </div>
      <p className="small" style={{ marginTop: 16 }}>
        <Link href="/family/lessons">← Back to lessons</Link>
      </p>
    </>
  )
}
