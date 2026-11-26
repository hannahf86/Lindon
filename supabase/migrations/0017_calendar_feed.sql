-- =============================================================================
-- 0017_calendar_feed.sql — private calendar subscription link per teacher
--
-- /api/calendar/<calendar_token> serves the teacher's lessons and events as
-- an .ics feed for Google / Apple / Outlook calendars ("From URL"). The token
-- is long and random; resetting it in Settings stops the old link working.
-- Made on first use, so it's null until the teacher asks for a link.
-- =============================================================================
alter table public.teachers add column if not exists calendar_token text unique;

notify pgrst, 'reload schema';
