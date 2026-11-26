-- =============================================================================
-- 0019_message_seen.sql — families can mark a teacher's message as "seen"
--
-- A "👍 Seen" button under the teacher's messages in the family area, so a
-- parent can acknowledge (say) a cancellation without writing back. The
-- teacher sees "✓ Seen" under that message. read_at (opened) is unchanged.
-- The protect_messages trigger only blocks changes to the message itself
-- (body, sender…), so setting this is allowed; it's never cleared.
-- =============================================================================
alter table public.messages add column if not exists seen_at timestamptz;

notify pgrst, 'reload schema';
