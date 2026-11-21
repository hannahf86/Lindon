'use client'
// =============================================================================
// family/messages/refresh-on-read.tsx — after the page marks messages as read,
// refresh once so the unread badge in the (persistent) top bar catches up.
// Only rendered when something was actually marked read, so it can't loop.
// =============================================================================
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function RefreshOnRead() {
  const router = useRouter()
  useEffect(() => {
    router.refresh()
  }, [router])
  return null
}
