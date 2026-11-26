-- =============================================================================
-- 0023_holidays.sql — holidays and term breaks
--
-- A named stretch of days with no lessons (e.g. "Half term", 26–30 Oct).
-- Regular bookings skip those days: no lessons are made, so nothing is
-- charged; lessons already on an invoice when a holiday is added are marked
-- "teacher cancelled" instead (make-up credit when billing in advance, not
-- charged in arrears). The calendar shows holidays and has no free time on
-- them, so families can't reschedule into them either.
-- =============================================================================
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (ends_on - starts_on <= 366),
  unique (id, teacher_id)
);
create index holidays_teacher_dates on public.holidays (teacher_id, starts_on, ends_on);
alter table public.holidays enable row level security;

notify pgrst, 'reload schema';
