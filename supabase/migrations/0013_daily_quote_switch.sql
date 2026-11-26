-- =============================================================================
-- 0013_daily_quote_switch.sql — "Funny quote of the day" (teacher dashboard
-- only) becomes a feature switch: key 'daily_quote' (lib/features.ts).
-- On for existing teachers and new ones; switch off in Settings.
-- =============================================================================
alter table public.teachers alter column features set default array['daily_tip', 'daily_quote'];

update public.teachers
   set features = array_append(features, 'daily_quote')
 where not ('daily_quote' = any(features));
