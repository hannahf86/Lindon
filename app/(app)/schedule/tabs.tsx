// =============================================================================
// schedule/tabs.tsx — the tabs under Schedule:
//   Calendar        /schedule        day / week / month
//   Teaching hours  /schedule/hours  the blocks of time you teach
//   Free slots      /schedule/slots  each pupil's regular lesson time, and booking new ones
//   Attendance      /schedule/attendance  mark lessons straight from a list
//   Holidays        /schedule/holidays    holidays and term breaks (no lessons)
// =============================================================================
import Link from 'next/link'

export function ScheduleTabs({ current }: { current: 'calendar' | 'hours' | 'slots' | 'attendance' | 'holidays' }) {
  return (
    <nav className="tabs" style={{ margin: 0 }} aria-label="Schedule views">
      <Link href="/schedule" aria-current={current === 'calendar' ? 'page' : undefined}>
        Calendar
      </Link>
      <Link href="/schedule/hours" aria-current={current === 'hours' ? 'page' : undefined}>
        Teaching hours
      </Link>
      <Link href="/schedule/slots" aria-current={current === 'slots' ? 'page' : undefined}>
        Free slots
      </Link>
      <Link href="/schedule/attendance" aria-current={current === 'attendance' ? 'page' : undefined}>
        Attendance
      </Link>
      <Link href="/schedule/holidays" aria-current={current === 'holidays' ? 'page' : undefined}>
        Holidays
      </Link>
    </nav>
  )
}
