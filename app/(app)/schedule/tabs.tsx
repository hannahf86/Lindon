// =============================================================================
// schedule/tabs.tsx — switches between the calendar (day/week/month) and the time slots
// (the weekly timetable). Both live under Schedule in the sidebar.
// =============================================================================
import Link from 'next/link'

export function ScheduleTabs({ current }: { current: 'calendar' | 'slots' }) {
  return (
    <nav className="tabs" style={{ margin: 0 }} aria-label="Schedule views">
      <Link href="/schedule" aria-current={current === 'calendar' ? 'page' : undefined}>
        Calendar
      </Link>
      <Link href="/schedule/slots" aria-current={current === 'slots' ? 'page' : undefined}>
        Time slots
      </Link>
    </nav>
  )
}
