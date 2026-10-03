'use server'
// =============================================================================
// exams/actions.ts — create / update / delete exams. Board, grade, instrument
// and time are typed by the teacher. Every query is scoped to the signed-in
// teacher; the composite foreign key rejects another teacher's student.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { date, handle, oneOf, optionalNum, ref, str, time, FormError, type ActionState } from '@/lib/forms'

const STATUSES = ['planned', 'entered', 'taken', 'withdrawn'] as const

/** Read the exam form into a row (shared by create + update). */
function readExam(fd: FormData) {
  const student_id = ref(fd, 'student_id')
  if (!student_id) throw new FormError('Choose which student is taking the exam.')
  return {
    student_id,
    instrument: str(fd, 'instrument'),
    board: str(fd, 'board'),
    grade: str(fd, 'grade'),
    exam_date: date(fd, 'exam_date'),
    exam_time: time(fd, 'exam_time', 'Exam time'),
    venue: str(fd, 'venue'),
    entry_deadline: date(fd, 'entry_deadline'),
    fee: optionalNum(fd, 'fee', 'Fee'),
    status: oneOf(fd, 'status', STATUSES, 'planned'),
    result: str(fd, 'result'),
    notes: str(fd, 'notes'),
  }
}

function revalidateExams(studentId?: string) {
  revalidatePath('/exams')
  revalidatePath('/')
  if (studentId) revalidatePath(`/students/${studentId}`)
}

// ---- Create ------------------------------------------------------------------------
export async function createExam(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = ''
  let studentId = ''
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const row = must(await db().from('exams').insert({ ...readExam(fd), teacher_id: teacher.id }).select('id, student_id').single())
    id = row.id
    studentId = row.student_id
  })
  if (result?.error) return result
  revalidateExams(studentId)
  redirect(`/exams/${id}?saved=1`)
}

// ---- Update ------------------------------------------------------------------------
export async function updateExam(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const row = must(await db().from('exams').update(readExam(fd)).eq('id', id).eq('teacher_id', teacher.id).select('student_id').single())
    revalidateExams(row.student_id)
    revalidatePath(`/exams/${id}`)
    return { ok: 'Exam saved.' }
  })
}

// ---- Delete ------------------------------------------------------------------------
export async function deleteExam(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  const rows = must(await db().from('exams').delete().eq('id', id).eq('teacher_id', teacher.id).select('student_id'))
  revalidateExams(rows[0]?.student_id)
  redirect('/exams')
}
