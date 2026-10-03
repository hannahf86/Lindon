// =============================================================================
// messages/tabs.tsx — the tab links at the top of the Messages area
//   Inbox          /messages        in-app conversations with families
//   Email families /messages/email  one-off emails + the sent-email log
// =============================================================================
import Link from 'next/link'

export function MessagesTabs(props: { current: 'inbox' | 'email'; unread?: number }) {
  return (
    <nav className="tabs" aria-label="Messages">
      <Link href="/messages" aria-current={props.current === 'inbox' ? 'page' : undefined}>
        Inbox{props.unread ? ` (${props.unread})` : ''}
      </Link>
      <Link href="/messages/email" aria-current={props.current === 'email' ? 'page' : undefined}>
        Email families
      </Link>
    </nav>
  )
}
