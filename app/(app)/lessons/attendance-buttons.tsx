// =============================================================================
// lessons/attendance-buttons.tsx — one-tap attendance for a lesson
//
// Present · Absent · Notice given · Teacher cancelled. The two that earn a
// make-up credit ask first, because they also email the family about it.
// The current attendance is shown highlighted. Used on the lesson page and
// in the Schedule's day view.
// =============================================================================
import type { LessonStatus } from '@/lib/database.types'
import { ActionForm, ConfirmButton, SubmitButton } from '@/components/forms'
import { setAttendance } from './actions'

const BUTTONS: { status: LessonStatus; label: string; credit: boolean }[] = [
  { status: 'present', label: 'Present', credit: false },
  { status: 'absent', label: 'Absent', credit: false },
  { status: 'notice_given', label: 'Notice given', credit: true },
  { status: 'teacher_cancelled', label: 'I cancelled', credit: true },
]

export function AttendanceButtons(props: { lessonId: string; status: LessonStatus; pupil: string; small?: boolean }) {
  const size = props.small ? ' btn-sm' : ''
  return (
    <div className="attendance">
      {BUTTONS.map((b) => {
        const current = props.status === b.status
        const cls = `btn${size} ${current ? 'att-current' : 'btn-secondary'}`
        if (current) {
          return (
            <span key={b.status} className={`btn${size} att-current`} aria-current="true">
              ✓ {b.label}
            </span>
          )
        }
        return b.credit ? (
          <ConfirmButton
            key={b.status}
            action={setAttendance.bind(null, props.lessonId, b.status)}
            confirm={`Mark this lesson as "${b.label.toLowerCase()}"? ${props.pupil} gets a make-up credit for it, which comes off next month's invoice, and the family is emailed to let them know.`}
            className={cls}
          >
            {b.label}
          </ConfirmButton>
        ) : (
          <ActionForm key={b.status} action={setAttendance.bind(null, props.lessonId, b.status)} className="att-form">
            <SubmitButton className={cls} pendingText="…">
              {b.label}
            </SubmitButton>
          </ActionForm>
        )
      })}
    </div>
  )
}
