// =============================================================================
// components/unread-bell.tsx — the "new messages" marker on a Messages link
//
// A small bell with the unread count in a coral bubble, used in the teacher
// sidebar and the family top bar. Renders nothing when there's nothing new.
// Server-safe (no state) so both client and server navs can use it.
// =============================================================================
export function UnreadBell({ count }: { count: number }) {
  if (!count) return null
  const label = `${count} new message${count === 1 ? '' : 's'}`
  return (
    <span className="unread-bell" aria-label={label} title={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2a6 6 0 0 0-6 6v3.6l-1.7 3.4A1 1 0 0 0 5.2 16.5h13.6a1 1 0 0 0 .9-1.5L18 11.6V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.8-2h-5.6A3 3 0 0 0 12 22Z" />
      </svg>
      {count > 99 ? '99+' : count}
    </span>
  )
}
