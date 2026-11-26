-- =============================================================================
-- 0018_family_onboarding.sql — families join through their own welcome page
--
-- The invitation email now links to /join/<invite_token> instead of the
-- sign-in page. There the parent (or adult pupil) checks their details, sees
-- the pupil's details and lesson times / price, and creates a password.
-- onboarded_at records when they finished; after that the link just says
-- "you're all set — sign in".
-- =============================================================================
alter table public.family_access
  add column if not exists invite_token text unique,
  add column if not exists onboarded_at timestamptz;

-- Existing live invitations get a token so "Resend invite" sends the new link
update public.family_access
   set invite_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 where invite_token is null and revoked_at is null;

notify pgrst, 'reload schema';
