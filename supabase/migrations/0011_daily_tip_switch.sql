-- =============================================================================
-- 0011_daily_tip_switch.sql — "Tip of the day" becomes a feature switch
--
-- The daily tip on the teacher dashboard can now be switched off in Settings
-- (feature key 'daily_tip', see lib/features.ts). It stays on for everyone
-- who already has it, and starts on for new teachers.
-- =============================================================================
alter table public.teachers alter column features set default array['daily_tip'];

update public.teachers
   set features = array_append(features, 'daily_tip')
 where not ('daily_tip' = any(features));
