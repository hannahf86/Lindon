-- =============================================================================
-- 0028_feedback.sql — messages from the public Contact page
--
-- Suggestions, bug reports and questions from anyone (signed in or not).
-- Each one is emailed to the Lindon admins and listed in /admin → Feedback,
-- where an admin can mark it as dealt with. Server-only like everything else
-- (service role; RLS on with no policies).
-- =============================================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'other' check (kind in ('suggestion', 'bug', 'question', 'other')),
  name text not null default '',
  email text not null default '' check (length(email) <= 320),
  message text not null check (length(trim(message)) > 0 and length(message) <= 5000),
  signed_in_as text not null default '',   -- the Lindon account, when they were signed in
  page text not null default '',           -- where they were (for bug reports)
  user_agent text not null default '',     -- their browser (for bug reports)
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

notify pgrst, 'reload schema';
