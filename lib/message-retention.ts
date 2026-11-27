// =============================================================================
// lib/message-retention.ts — the 5-year message clear-out (safeguarding)
//
// purgeOldMessages() runs once a day from the cron job. It deletes every
// message sent more than RETENTION_YEARS ago, then any conversation left
// empty, via the database function purge_old_messages (migration 0027) —
// the only way messages can ever be deleted.
// =============================================================================
import 'server-only'
import { db } from './db'

export const RETENTION_YEARS = 5

export async function purgeOldMessages(now = new Date()): Promise<{ messages: number; conversations: number }> {
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - RETENTION_YEARS)
  // Untyped: the function isn't in database.types.ts's Functions list
  const { data, error } = await (db().rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: { messages_deleted: number; conversations_deleted: number }[] | null; error: { message: string } | null }>)(
    'purge_old_messages',
    { cutoff: cutoff.toISOString() },
  )
  if (error) throw new Error(error.message)
  return { messages: data?.[0]?.messages_deleted ?? 0, conversations: data?.[0]?.conversations_deleted ?? 0 }
}
