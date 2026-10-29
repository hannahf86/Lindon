-- =============================================================================
-- 0006_access_requests.sql — "Request an account" for new teachers
--
-- While Lindon is invite-only, a teacher fills in the Create account form,
-- which adds a row here (status 'pending') and emails the admin. The admin
-- approves or declines in Settings → Access requests. An approved email may
-- then sign in and gets a teacher account pre-filled with the name and
-- studio they gave. Admins are the emails in AUTH_ADMIN_EMAILS (falling back
-- to AUTH_ALLOWED_EMAILS) — see lib/access.ts.
-- =============================================================================

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text not null default '',
  studio text not null default '',
  teaches text not null default '',          -- typed: "Piano and violin, 25 pupils"
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);
create index access_requests_status_idx on public.access_requests (status, created_at desc);

alter table public.access_requests enable row level security;
revoke all on public.access_requests from anon, authenticated;

notify pgrst, 'reload schema';
