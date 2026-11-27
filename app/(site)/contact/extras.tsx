'use client'
// =============================================================================
// (site)/contact/extras.tsx — hidden details sent with the contact form
//
// opened_at   when the page opened (a form sent back in under 3 seconds is a bot)
// page        the page they came from (helps with bug reports)
// user_agent  their browser and device (helps with bug reports)
// website     a trap field: hidden from people, but bots fill it in
// =============================================================================
import { useEffect, useRef } from 'react'

export function ContactExtras() {
  const opened = useRef<HTMLInputElement>(null)
  const page = useRef<HTMLInputElement>(null)
  const ua = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (opened.current) opened.current.value = String(Date.now())
    if (page.current) page.current.value = document.referrer
    if (ua.current) ua.current.value = navigator.userAgent
  }, [])

  return (
    <>
      <input ref={opened} type="hidden" name="opened_at" />
      <input ref={page} type="hidden" name="page" />
      <input ref={ua} type="hidden" name="user_agent" />
      <div className="site-trap" aria-hidden="true">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
    </>
  )
}
