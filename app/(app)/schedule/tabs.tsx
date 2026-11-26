// =============================================================================
// schedule/tabs.tsx — the tabs under Schedule:
//   Calendar        /schedule        day / week / month
//   Teaching hours  /schedule/hours  the blocks of time you teach
//   Free slots      /schedule/slots  each pupil's regular lesson time, and booking new ones
// =============================================================================
import Link from 'next/link'

export function ScheduleTabs({ current }: { current: 'calendar' | 'hours' | 'slots' }) {
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
    </nav>
  )
}
