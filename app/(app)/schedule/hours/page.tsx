// =============================================================================
// schedule/hours/page.tsx — Schedule → Teaching hours
// The blocks of time you teach each week. Lessons are booked inside them; the
// rest shows on the calendar as free time.
// =============================================================================
import type { Metadata } from 'next'
import { requireTeacher } from '@/lib/db'
import { PageHeader } from '@/components/ui'
import { TeachingHoursEditor } from '@/components/teaching-hours'
import { ScheduleTabs } from '../tabs'

export const metadata: Metadata = { title: 'Teaching hours' }

export default async function TeachingHoursPage() {
  const teacher = await requireTeacher()
  return (
    <>
      <PageHeader title="Schedule" subtitle="The hours you teach each week. Anything not booked shows as free time on your calendar." />
      <div style={{ marginBottom: 20 }}>
        <ScheduleTabs current="hours" />
      </div>
      <TeachingHoursEditor teacher={teacher} />
    </>
  )
}
