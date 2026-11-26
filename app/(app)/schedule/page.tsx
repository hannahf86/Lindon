// =============================================================================
// schedule/page.tsx — the teaching calendar: Day, Week or Month view
//
// /schedule?view=day|week|month&date=YYYY-MM-DD  (week is the default; the old
// ?week=YYYY-MM-DD links still work). The calendar itself is
// schedule/calendar.tsx, shared with the dashboard; this page adds the
// Calendar · Teaching hours · Free slots tabs and the period totals, then a
// bar right above the calendar: ‹ previous · this day/week/month · next › on
// the left, Day · Week · Month on the right.
// =============================================================================
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireTeacher } from '@/lib/db'
import { todayISO } from '@/lib/dates'
import { PageHeader } from '@/components/ui'
import { ScheduleTabs } from './tabs'
import { CalendarNav, CalendarSwitch, LessonCalendar, calendarPeriod } from './calendar'

export const metadata: Metadata = { title: 'Schedule' }

export default async function SchedulePage({ searchParams }: PageProps<'/schedule'>) {
  const teacher = await requireTeacher()
  const today = todayISO(teacher.timezone)
  const period = calendarPeriod(await searchParams, today)

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={period.title}
        actions={
          <Link className="btn" href="/lessons/new">
            + One-off lesson
          </Link>
        }
      />

      {/* ---- Calendar · Teaching hours · Free slots tabs ---- */}
      <div style={{ marginBottom: 28 }}>
        <ScheduleTabs current="calendar" />
      </div>

      <LessonCalendar
        teacher={teacher}
        period={period}
        today={today}
        basePath="/schedule"
        showTotals
        toolbar={
          // ‹ previous · period · next › | Day · Week · Month — right above the calendar
          <div className="cal-bar cal-bar-roomy">
            <CalendarNav basePath="/schedule" period={period} className="cal-nav-start" />
            <CalendarSwitch basePath="/schedule" period={period} />
          </div>
        }
      />
    </>
  )
}
