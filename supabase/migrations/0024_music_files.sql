-- =============================================================================
-- 0024_music_files.sql — music & files for families
--
-- The teacher uploads PDFs (sheet music), images or audio (backing tracks)
-- for everyone or chosen pupils; families with a login see and download the
-- ones meant for their children. Files live in a PRIVATE Storage bucket
-- "sheets": downloads go through Lindon, which checks who's asking and hands
-- out a short-lived link. Uploads go straight from the browser to storage
-- with a one-off signed upload link (so large PDFs aren't limited by the
-- server's request size). New feature switch: 'sheets' (on for existing
-- teachers; switch off in Settings → Features).
-- =============================================================================
create table public.shared_files (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  notes text not null default '',
  path text not null unique,            -- in the "sheets" bucket: <teacher_id>/<random>/<file name>
  file_name text not null,
  mime text not null,
  size_bytes integer not null default 0,
  everyone boolean not null default true,
  student_ids uuid[] not null default '{}', -- when not everyone: which pupils
  created_at timestamptz not null default now(),
  unique (id, teacher_id)
);
create index shared_files_teacher on public.shared_files (teacher_id, created_at desc);
alter table public.shared_files enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sheets', 'sheets', false, 26214400,
        array['application/pdf', 'image/png', 'image/jpeg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav'])
on conflict (id) do nothing;

-- The feature switch: on for everyone who has family logins on, and for new teachers
alter table public.teachers alter column features set default array['daily_tip', 'daily_quote', 'sheets'];
update public.teachers set features = array_append(features, 'sheets')
 where not ('sheets' = any(features)) and 'family_logins' = any(features);

notify pgrst, 'reload schema';
