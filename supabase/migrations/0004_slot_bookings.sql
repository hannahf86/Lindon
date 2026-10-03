-- =============================================================================
-- 0004_slot_bookings.sql — bookings have a start, an end and a frequency
--
-- A time slot's booking (the pupil in it) now runs for a set stretch —
-- typically a half term — instead of repeating forever:
--   starts_on     first lesson date
--   ends_on       last lesson date (the app requires one when a pupil is booked)
--   repeat_weeks  1 = every week, 2 = fortnightly (e.g. Tom), up to 12
--   skip_dates    dates inside the booking with no lesson (half-term week etc.)
-- Lessons are created/kept in step with the booking by the app.
-- =============================================================================

alter table public.time_slots
  add column starts_on date,
  add column ends_on date,
  add column repeat_weeks smallint not null default 1 check (repeat_weeks between 1 and 12),
  add column skip_dates date[] not null default '{}',
  add constraint time_slots_booking_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on);

-- Existing booked slots: start from this week's (or next) matching day, open-ended.
-- The app flags booked slots with no end date so the teacher can set one.
update public.time_slots
   set starts_on = current_date + ((day_of_week - extract(isodow from current_date)::int + 7) % 7)
 where student_id is not null and starts_on is null;

notify pgrst, 'reload schema';
