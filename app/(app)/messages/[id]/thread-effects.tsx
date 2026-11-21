'use client'
// =============================================================================
// messages/[id]/thread-effects.tsx — small browser-side touches for a thread
//   • scrolls the message list to the newest message (on load and after sending)
//   • if this visit marked messages as read, refreshes once so the sidebar's
//     unread badge (rendered by the layout) catches up
// Renders nothing.
// =============================================================================
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

export function ThreadEffects(props: { threadId: string; count: number; refresh: boolean }) {
  const router = useRouter()
  const refreshed = useRef(false)

  // ---- Scroll to newest ----
  useEffect(() => {
    const el = document.getElementById(props.threadId)
    if (el) el.scrollTop = el.scrollHeight
  }, [props.threadId, props.count])

  // ---- Update the unread badge ----
  useEffect(() => {
    if (props.refresh && !refreshed.current) {
      refreshed.current = true
      router.refresh()
    }
  }, [props.refresh, router])

  return null
}
