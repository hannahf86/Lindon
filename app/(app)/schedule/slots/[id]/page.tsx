// =============================================================================
// schedule/slots/[id]/page.tsx — edit one time slot (with the option to update its
// upcoming lessons too) or delete it.
// =============================================================================
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db, requireTeacher } from '@/lib/db'
import { dayName, hhmm } from '@/lib/format'
import { currencySymbol } from '@/lib/lessons'
import { distinctValues, instrumentSuggestions, studentOptions } from '@/lib/queries'
import { ConfirmButton } from '@/components/forms'
import { Card, PageHeader } from '@/components/ui'
import { SlotForm } from '../slot-form'
import { deleteSlot, updateSlot } from '../actions'

export const metadata: Metadata = { title: 'Edit time slot' }

export default async function EditSlotPage({ params, searchParams }: PageProps<'/schedule/slots/[id]'>) {
  const { id } = await params
  const sp = await searchParams
  // Opened from a pupil's page? Go back there after saving / cancelling
  const from = typeof sp.from === 'string' && /^\/students\/[0-9a-f-]{36}$/i.test(sp.from) ? sp.from : null
  const teacher = await requireTeacher()
  const t = teacher.id

  const { data: slot } = await db().from('time_slots').select('*').eq('id', id).eq('teacher_id', t).maybeSingle()
  if (!slot) notFound()

  const [students, instruments, locations, upcoming] = await Promise.all([
    // Include left students so an old booking still shows as selected
    studentOptions(t, { includeLeft: true }),
    instrumentSuggestions(t),
    distinctValues(t, 'time_slots', 'location'),
    db()
      .from('lessons')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', t)
      .eq('time_slot_id', id)
      .eq('status', 'scheduled')
      .gte('starts_at', new Date().toISOString()),
  ])

  const title = `${dayName(slot.day_of_week)} ${hhmm(slot.start_time)}`

  return (
    <>
      <PageHeader title={`Edit slot: ${title}`} back={from ? { href: from, label: 'Back to pupil' } : { href: '/schedule/slots', label: 'Schedule · Time slots' }} />

      {/* ---- Slot form ---- */}
      <Card>
        <SlotForm
          action={updateSlot.bind(null, id)}
          slot={slot}
          students={students}
          instrumentSuggestions={instruments}
          locationSuggestions={locations}
          currencySymbol={currencySymbol(teacher.currency)}
          upcomingLessons={upcoming.count ?? 0}
          cancelHref={from ?? '/schedule/slots'}
          returnTo={from ?? undefined}
        />
      </Card>

      {/* ---- Danger zone ---- */}
      <Card>
        <ConfirmButton
          action={deleteSlot.bind(null, id)}
          confirm={`Delete the ${title} slot? Lessons already made from it are kept. This can't be undone — you can switch the slot off instead.`}
        >
          Delete slot
        </ConfirmButton>
      </Card>
    </>
  )
}
