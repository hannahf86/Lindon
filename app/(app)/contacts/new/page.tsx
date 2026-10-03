// =============================================================================
// contacts/new/page.tsx — add a parent or guardian
// ?student=<id> ticks that student in the "parent of" list.
// =============================================================================
import type { Metadata } from 'next'
import { requireTeacher } from '@/lib/db'
import { studentOptions } from '@/lib/queries'
import { PageHeader } from '@/components/ui'
import { GuardianForm } from '../guardian-form'
import { createGuardian } from '../actions'

export const metadata: Metadata = { title: 'Add contact' }

export default async function NewContactPage({ searchParams }: PageProps<'/contacts/new'>) {
  const teacher = await requireTeacher()
  const sp = await searchParams
  const students = await studentOptions(teacher.id)
  const preselect = typeof sp.student === 'string' && students.some((s) => s.id === sp.student) ? [sp.student] : []

  return (
    <>
      <PageHeader
        title="Add a parent or guardian"
        subtitle="For students under 18. Adult students don't need a contact — their own details are on their student record."
        back={{ href: '/contacts', label: 'Parents & contacts' }}
      />
      <GuardianForm action={createGuardian} students={students} preselect={preselect} cancelHref="/contacts" />
    </>
  )
}
