-- =============================================================================
-- 0010_teaching_hours.sql — the blocks of time a teacher teaches
--
-- e.g. Saturday 09:00–17:00. Lessons are booked inside these hours (each
-- pupil's day, time, length and price live on their booking — time_slots with
-- a student). Whatever isn't booked is free time; days with no hours show as
-- "Not a teaching day". A day can have more than one block (e.g. 9–12, 14–18).
-- =============================================================================
create table public.teaching_hours (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7), -- ISO: 1 = Monday … 7 = Sunday
  starts time not null,
  ends time not null,
  created_at timestamptz not null default now(),
  check (ends > starts),
  unique (id, teacher_id)
);
create index teaching_hours_teacher_idx on public.teaching_hours (teacher_id, day_of_week, starts);

alter table public.teaching_hours enable row level security;
revoke all on public.teaching_hours from anon, authenticated;

notify pgrst, 'reload schema';
