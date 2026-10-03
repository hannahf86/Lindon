'use client'
// =============================================================================
// app/(app)/error.tsx — friendly fallback when a page fails to load
// (e.g. the database is unreachable). Keeps the sidebar; offers "Try again".
// Server error details are hidden in production; the digest helps match logs.
// =============================================================================
import { useEffect } from 'react'
import Link from 'next/link'

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="card">
      <div className="empty">
        <h3>Sorry, something went wrong</h3>
        <p>That page couldn&apos;t load just now. Nothing you saved has been lost — try again in a moment.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            Go to the dashboard
          </Link>
        </div>
        {error.digest && <p className="small" style={{ marginTop: 16 }}>Reference: {error.digest}</p>}
      </div>
    </section>
  )
}
