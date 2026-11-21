// =============================================================================
// schedule/page.tsx — the teaching calendar: Day, Week or Month view
//
// /schedule?view=day|week|month&date=YYYY-MM-DD  (week is the default; the old
// ?week=YYYY-MM-DD links still work). The calendar itself is
// schedule/calendar.tsx, shared with the dashboard; this page adds the
// previous / next buttons, the Calendar · Time slots tabs and period totals.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireTeacher } from '@/lib/db'
import { todayISO } from '@/lib/dates'
import { PageHeader } from '@/components/ui'
import { ScheduleTabs } from './tabs'
import { CalendarSwitch, LessonCalendar, calendarPeriod } from './calendar'

export const metadata: Metadata = { title: 'Schedule' }

export default async function SchedulePage({ searchParams }: PageProps<'/schedule'>) {
  const teacher = await requireTeacher()
  const today = todayISO(teacher.timezone)
  const period = calendarPeriod(await searchParams, today)
  const href = (date: string) => `/schedule?view=${period.view}&date=${date}`

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={period.title}
        actions={
          <>
            {/* ---- Previous / today / next ---- */}
            <Link className="btn btn-secondary" href={href(period.prev)}>
              ← Previous
            </Link>
            {!period.isCurrent && (
              <Link className="btn btn-secondary" href={href(today)}>
                {period.todayLabel}
              </Link>
            )}
            <Link className="btn btn-secondary" href={href(period.next)}>
              Next →
            </Link>
            <Link className="btn" href="/lessons/new">
              + One-off lesson
            </Link>
          </>
        }
      />

      {/* ---- Calendar / Time slots tabs, and the Day · Week · Month switch ---- */}
      <div className="spread" style={{ marginBottom: 20 }}>
        <ScheduleTabs current="calendar" />
        <CalendarSwitch basePath="/schedule" period={period} />
      </div>

      <LessonCalendar teacher={teacher} period={period} today={today} basePath="/schedule" showTotals />
    </>
  )
}
