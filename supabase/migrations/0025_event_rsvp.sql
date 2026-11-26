-- =============================================================================
-- 0025_event_rsvp.sql — share events with families and ask who's coming
--
-- An event can be shown to families (everyone, or chosen pupils). Families
-- answer per pupil — "Coming" or "Can't make it", with an optional note —
-- and the teacher sees the replies on the event page. One answer per pupil
-- per event (changing it overwrites the old one).
-- =============================================================================
alter table public.events
  add column if not exists shared boolean not null default false,
  add column if not exists everyone boolean not null default true,
  add column if not exists student_ids uuid[] not null default '{}';

create table public.event_responses (
  event_id uuid not null,
  teacher_id uuid not null,
  student_id uuid not null,
  response text not null check (response in ('yes', 'no')),
  note text not null default '',
  responded_by text not null default '',   -- the family member's email (audit)
  responded_at timestamptz not null default now(),
  primary key (event_id, student_id),
  foreign key (event_id, teacher_id) references public.events (id, teacher_id) on delete cascade,
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade
);
alter table public.event_responses enable row level security;

notify pgrst, 'reload schema';
