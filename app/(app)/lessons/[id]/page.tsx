// =============================================================================
// lessons/[id]/page.tsx — one lesson: edit the details, mark attendance, send a
// reminder now, or delete it.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db, requireTeacher } from '@/lib/db'
import { duration, fullName, money } from '@/lib/format'
import { fmtTz } from '@/lib/dates'
import { currencySymbol } from '@/lib/lessons'
import { instrumentSuggestions } from '@/lib/queries'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { Badge, Card, PageHeader, StatusBadge } from '@/components/ui'
import { LessonFields } from '../lesson-fields'
import { deleteLesson, sendReminderNow, updateLesson } from '../actions'
import { AttendanceButtons } from '../attendance-buttons'
import { usesCredits } from '@/lib/features'

export const metadata: Metadata = { title: 'Lesson' }

export default async function LessonPage({ params }: PageProps<'/lessons/[id]'>) {
  const { id } = await params
  const teacher = await requireTeacher()
  const tz = teacher.timezone
  const t = teacher.id

  const { data: lesson } = await db()
    .from('lessons')
    .select('*, students(id, first_name, last_name, status, reminders_enabled), time_slots(id, day_of_week, start_time)')
    .eq('id', id)
    .eq('teacher_id', t)
    .maybeSingle()
  if (!lesson) notFound()

  const [instruments, locations, credit] = await Promise.all([
    instrumentSuggestions(t),
    Promise.resolve(teacher.locations),
    // This lesson's make-up credit, if it earned one
    db().from('lesson_credits').select('amount, invoice_item_id').eq('teacher_id', t).eq('lesson_id', id).maybeSingle().then((r) => r.data),
  ])

  const credits = usesCredits(teacher)
  const student = lesson.students
  const studentName = fullName(student) || 'Student'
  const isPast = new Date(lesson.starts_at) < new Date()

  return (
    <>
      <PageHeader
        title={`${studentName} — ${fmtTz(lesson.starts_at, tz, 'EEE d MMM, HH:mm')}`}
        back={{ href: '/schedule', label: 'Schedule' }}
        subtitle={
          <span className="row" style={{ gap: 6 }}>
            <StatusBadge status={lesson.status} />
            <span>{duration(lesson.duration_minutes)}</span>
            <span>· {money(lesson.price, teacher.currency)}</span>
            {!lesson.chargeable && <Badge tone="butter">Not charged</Badge>}
            {lesson.instrument && <span>· {lesson.instrument}</span>}
            {lesson.location && <span>· {lesson.location}</span>}
            {lesson.time_slots ? <Badge tone="sky">Weekly slot</Badge> : <Badge tone="purple">One-off</Badge>}
          </span>
        }
        actions={
          <>
            {student && (
              <Link className="btn btn-secondary" href={`/students/${student.id}`}>
                {student.first_name}&apos;s page
              </Link>
            )}
            <Link className="btn btn-secondary" href={`/schedule?week=${fmtTz(lesson.starts_at, tz, 'yyyy-MM-dd')}`}>
              See the week
            </Link>
          </>
        }
      />

      <div className="split">
        <div className="stack">
          {/* ---- Lesson details (edit) ---- */}
          <Card title="Lesson details">
            <ActionForm action={updateLesson.bind(null, id)}>
              <LessonFields
                lesson={lesson}
                timeZone={tz}
                currencySymbol={currencySymbol(teacher.currency)}
                instrumentSuggestions={instruments}
                locations={locations}
                credits={credits}
              />
              <div className="form-actions">
                <SubmitButton>Save details</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>

        <div className="stack">
          {/* ---- Attendance (billing in advance: credits for notice given / teacher cancelled) ---- */}
          <Card title="Attendance">
            <AttendanceButtons lessonId={id} status={lesson.status} pupil={student?.first_name ?? 'The pupil'} credits={credits} />
            {credits && credit && (
              <p className="small" style={{ margin: '12px 0 0' }}>
                <Badge tone={credit.invoice_item_id ? 'plain' : 'teal'}>{credit.invoice_item_id ? 'Credit used' : 'Make-up credit'}</Badge>{' '}
                {money(credit.amount, teacher.currency)}{' '}
                {credit.invoice_item_id ? 'has been taken off an invoice.' : 'will come off their next invoice.'}
              </p>
            )}
          </Card>

          {/* ---- Quick actions ---- */}
          <Card title="Quick actions">
            <div className="stack" style={{ gap: 10, alignItems: 'flex-start' }}>
              {lesson.status === 'scheduled' && !isPast && (
                <div>
                  <ConfirmButton
                    action={sendReminderNow.bind(null, id)}
                    confirm={`Email a lesson reminder about ${studentName}'s lesson now?`}
                    className="btn btn-secondary btn-sm"
                  >
                    Send reminder now
                  </ConfirmButton>
                  <p className="small muted" style={{ margin: '6px 0 0' }}>
                    {lesson.reminder_sent_at
                      ? `Reminder sent ${fmtTz(lesson.reminder_sent_at, tz, "d MMM 'at' HH:mm")}.`
                      : student && !student.reminders_enabled
                        ? `Automatic reminders are off for ${student.first_name}.`
                        : teacher.reminders_enabled
                          ? `An automatic reminder goes out ${teacher.reminder_hours_before} hour${teacher.reminder_hours_before === 1 ? '' : 's'} before.`
                          : 'Automatic reminders are switched off in Settings.'}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* ---- Danger zone ---- */}
          <Card>
            <ConfirmButton
              action={deleteLesson.bind(null, id)}
              confirm={`Delete this lesson and its notes? This can't be undone — to keep a record, set its status to "Cancelled" instead.`}
            >
              Delete lesson
            </ConfirmButton>
          </Card>
        </div>
      </div>
    </>
  )
}
