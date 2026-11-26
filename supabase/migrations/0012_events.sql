-- =============================================================================
-- 0012_events.sql — calendar events (concerts, exam days, group lessons…)
--
-- Added from the calendar: click a day → "Event". An event has a title, a
-- kind (concert · exam day · group lesson · mock exam · other), a date, and
-- optional start/end times (no times = all day), location and notes.
-- Timed events count as busy, so they come out of the day's free time.
-- Family confirmation ("who's coming?") is a later phase.
-- Server-only access via the service role, like everything else (RLS on, no
-- policies).
-- =============================================================================
create table public.events (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  kind text not null default 'other'
    check (kind in ('concert', 'exam_day', 'group_lesson', 'mock_exam', 'other')),
  event_date date not null,
  starts time,
  ends time,
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends is null or starts is null or ends > starts),
  check (ends is null or starts is not null),
  unique (id, teacher_id)
);
create index events_teacher_date on public.events (teacher_id, event_date);
alter table public.events enable row level security;
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
