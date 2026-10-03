// =============================================================================
// exams/exam-form.tsx — the add / edit exam form
// Student is chosen with a Picker; instrument, board, grade and time are all
// typed (with the teacher's past values offered as one-tap chips).
// =============================================================================
import Link from 'next/link'
import type { Exam } from '@/lib/database.types'
import type { ActionState } from '@/lib/forms'
import { hhmm } from '@/lib/format'
import { ActionForm, SubmitButton } from '@/components/forms'
import { Picker, type PickerOption } from '@/components/pickers'
import { Card, MoneyField, Segmented, TextArea, TextField } from '@/components/ui'
import { SuggestField } from '@/components/pickers'

export type ExamSuggestions = { instruments: string[]; boards: string[]; grades: string[]; venues: string[] }

export function ExamForm(props: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>
  exam?: Exam
  students: PickerOption[]
  preselectStudent?: string
  suggestions: ExamSuggestions
  currencySymbol: string
  cancelHref: string
}) {
  const e = props.exam
  return (
    <ActionForm action={props.action}>
      {/* ---- Who and what ---- */}
      <Card title="The exam">
        <div className="form">
          <Picker name="student_id" label="Student" options={props.students} defaultValue={e?.student_id ?? props.preselectStudent} placeholder="Search students…" />
          <div className="form-grid">
            <SuggestField label="Instrument" name="instrument" defaultValue={e?.instrument} suggestions={props.suggestions.instruments} placeholder="e.g. Piano" />
            <SuggestField label="Exam board" name="board" defaultValue={e?.board} suggestions={props.suggestions.boards} placeholder="e.g. ABRSM, Trinity, RSL" />
            <SuggestField label="Grade" name="grade" defaultValue={e?.grade} suggestions={props.suggestions.grades} placeholder="e.g. Grade 3, Initial, Performance Grade 5" />
            <Segmented
              label="Status"
              name="status"
              options={['planned', 'entered', 'taken', 'withdrawn']}
              defaultValue={e?.status ?? 'planned'}
              hint="Planned → entered once you've booked it → taken."
            />
          </div>
        </div>
      </Card>

      {/* ---- When and where ---- */}
      <Card title="When & where">
        <div className="form-grid">
          <TextField label="Exam date" name="exam_date" type="date" defaultValue={e?.exam_date ?? ''} hint="Leave empty if not confirmed yet." />
          <TextField label="Exam time" name="exam_time" defaultValue={hhmm(e?.exam_time)} placeholder="e.g. 14:20 or 2:20pm" autoComplete="off" />
          <SuggestField label="Venue" name="venue" defaultValue={e?.venue} suggestions={props.suggestions.venues} placeholder="e.g. St Peter's Church Hall" className="full" />
          <TextField label="Entry deadline" name="entry_deadline" type="date" defaultValue={e?.entry_deadline ?? ''} hint="Last day to enter — shown on your dashboard as it gets close." />
          <MoneyField label="Entry fee" name="fee" symbol={props.currencySymbol} defaultValue={e?.fee ?? ''} />
        </div>
      </Card>

      {/* ---- Result & notes ---- */}
      <Card title="Result & notes">
        <div className="form">
          <TextField label="Result" name="result" defaultValue={e?.result} placeholder="e.g. Merit (124)" />
          <TextArea label="Notes" name="notes" defaultValue={e?.notes} hint="Pieces, scales, accompanist, anything to remember." />
        </div>
      </Card>

      <div className="form-actions">
        <SubmitButton>{e ? 'Save changes' : 'Add exam'}</SubmitButton>
        <Link href={props.cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </ActionForm>
  )
}
