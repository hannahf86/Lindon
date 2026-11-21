-- =============================================================================
-- 0009_passwords.sql — optional passwords for signing in
--
-- Anyone signed in (teacher or family) can set a password in /account and
-- then sign in with email + password instead of an emailed link. Only a slow
-- salted hash is stored (scrypt, see lib/passwords.ts), never the password.
-- failed_attempts / locked_until slow down password guessing: after 10 wrong
-- tries the account's password sign-in pauses for 15 minutes.
-- Like everything else, only the server (service role) can read this table.
-- =============================================================================
create table public.user_passwords (
  user_id uuid primary key references next_auth.users (id) on delete cascade,
  hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_passwords enable row level security;
revoke all on public.user_passwords from anon, authenticated;

notify pgrst, 'reload schema';
