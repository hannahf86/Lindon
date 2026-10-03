'use server'
// =============================================================================
// library/actions.ts — books & equipment: create / update / delete items,
// lend them to students and mark them returned. Every query is scoped to the
// signed-in teacher. The database refuses a second open loan for the same
// item (partial unique index), which we turn into a friendly message.
// =============================================================================
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { db, must, requireTeacher } from '@/lib/db'
import { bool, date, handle, optionalNum, ref, required, str, FormError, type ActionState } from '@/lib/forms'
import { todayISO } from '@/lib/dates'

/** Read the item form into a row (shared by create + update). */
function readItem(fd: FormData) {
  return {
    title: required(fd, 'title', 'Name'),
    kind: str(fd, 'kind'),
    identifier: str(fd, 'identifier'),
    condition: str(fd, 'condition'),
    value: optionalNum(fd, 'value', 'Value'),
    notes: str(fd, 'notes'),
    archived: bool(fd, 'archived'),
  }
}

function revalidateLibrary(itemId?: string) {
  revalidatePath('/library')
  if (itemId) revalidatePath(`/library/${itemId}`)
  revalidatePath('/students', 'layout')
  revalidatePath('/')
}

// ---- Create ------------------------------------------------------------------------
export async function createItem(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = ''
  const result = await handle(async () => {
    const teacher = await requireTeacher()
    const row = must(await db().from('library_items').insert({ ...readItem(fd), teacher_id: teacher.id }).select('id').single())
    id = row.id
  })
  if (result?.error) return result
  revalidateLibrary()
  redirect(`/library/${id}?new=1`)
}

// ---- Update ------------------------------------------------------------------------
export async function updateItem(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    must(await db().from('library_items').update(readItem(fd)).eq('id', id).eq('teacher_id', teacher.id).select('id').single())
    revalidateLibrary(id)
    return { ok: 'Item saved.' }
  })
}

// ---- Delete ------------------------------------------------------------------------
// Also deletes its loan history (cascade). Archiving keeps the history.
export async function deleteItem(id: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  must(await db().from('library_items').delete().eq('id', id).eq('teacher_id', teacher.id).select('id'))
  revalidateLibrary()
  redirect('/library')
}

// ---- Lend ------------------------------------------------------------------------------
export async function lendItem(_: ActionState, fd: FormData): Promise<ActionState> {
  return handle(async () => {
    const teacher = await requireTeacher()
    const itemId = ref(fd, 'item_id')
    const studentId = ref(fd, 'student_id')
    if (!itemId) throw new FormError('Choose the item you are lending.')
    if (!studentId) throw new FormError('Choose who is borrowing it.')
    const lentOn = date(fd, 'lent_on') ?? todayISO(teacher.timezone)
    const dueOn = date(fd, 'due_on')
    if (dueOn && dueOn < lentOn) throw new FormError('The return date is before the date it was lent.')

    // Make sure the item is ours and still in use
    const { data: item } = await db().from('library_items').select('id, title, archived').eq('id', itemId).eq('teacher_id', teacher.id).maybeSingle()
    if (!item) throw new FormError('That item no longer exists — refresh and try again.')
    if (item.archived) throw new FormError(`“${item.title}” is archived. Unarchive it before lending it out.`)

    const res = await db()
      .from('loans')
      .insert({ teacher_id: teacher.id, item_id: itemId, student_id: studentId, lent_on: lentOn, due_on: dueOn, notes: str(fd, 'notes') })
      .select('id')
      .single()
    if (res.error) {
      // 23505 = unique violation → the item already has an open loan
      if (res.error.code === '23505') throw new FormError(`“${item.title}” is already out on loan. Mark it as returned first.`)
      throw new Error(res.error.message)
    }
    revalidateLibrary(itemId)
    return { ok: `“${item.title}” lent out.` }
  })
}

// ---- Return ----------------------------------------------------------------------------
export async function returnLoan(loanId: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  const row = must(
    await db()
      .from('loans')
      .update({ returned_on: todayISO(teacher.timezone) })
      .eq('id', loanId)
      .eq('teacher_id', teacher.id)
      .is('returned_on', null)
      .select('item_id'),
  )
  revalidateLibrary(row[0]?.item_id)
  return { ok: 'Marked as returned.' }
}
