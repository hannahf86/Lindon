// =============================================================================
// app/(app)/not-found.tsx — shown when a record doesn't exist (or belongs to
// someone else) — e.g. an old link to a deleted student or invoice.
// =============================================================================
import Link from 'next/link'
import { Card, EmptyState } from '@/components/ui'

export default function NotFound() {
  return (
    <Card>
      <EmptyState
        title="We couldn’t find that"
        action={
          <Link href="/" className="btn">
            Back to the dashboard
          </Link>
        }
      >
        It may have been deleted, or the link might be wrong.
      </EmptyState>
    </Card>
  )
}
