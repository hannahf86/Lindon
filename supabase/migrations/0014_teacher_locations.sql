-- =============================================================================
-- 0014_teacher_locations.sql — each teacher's saved lesson locations
--
-- Shown as the Location dropdown when booking a lesson (with "add a new
-- location"), and edited in Settings → Locations. Starts with every location
-- the teacher has already typed on bookings and lessons.
-- =============================================================================
alter table public.teachers add column if not exists locations text[] not null default '{}';

update public.teachers t
   set locations = coalesce((
     select array_agg(loc order by loc)
       from (
         select distinct trim(location) as loc from public.time_slots where teacher_id = t.id and trim(location) <> ''
         union
         select distinct trim(location) from public.lessons where teacher_id = t.id and trim(location) <> ''
       ) x
   ), '{}')
 where t.locations = '{}';

notify pgrst, 'reload schema';
