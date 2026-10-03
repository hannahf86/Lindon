-- =============================================================================
-- 0003_family_access.sql — family logins + in-app messages
--
-- family_access: the teacher invites a parent/guardian (sees their under-18
--   children) or an adult pupil (sees themselves). Access is tied to an email
--   address; the person proves they own it by signing in with a magic link.
--   Revoking sets revoked_at — rows are kept as an audit trail.
--
-- conversations / messages: one conversation per family contact per teacher.
--   Messages are PERMANENT (safeguarding): a trigger blocks edits and
--   deletes, except the read_at receipt. Deleting a contact or pupil keeps
--   their conversation (it just loses the link); only deleting the teacher's
--   whole account removes messages.
-- =============================================================================

-- Family access --------------------------------------------------------------------
create table public.family_access (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  email text not null check (email = lower(email)),
  guardian_id uuid,            -- set for a parent / guardian…
  student_id uuid,             -- …or for an adult pupil (exactly one of the two)
  invited_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, teacher_id),
  check ((guardian_id is null) <> (student_id is null)),
  foreign key (guardian_id, teacher_id) references public.guardians (id, teacher_id) on delete cascade,
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade
);
-- One live invite per person per teacher
create unique index family_access_live_guardian on public.family_access (guardian_id) where revoked_at is null and guardian_id is not null;
create unique index family_access_live_student on public.family_access (student_id) where revoked_at is null and student_id is not null;
create index family_access_email_idx on public.family_access (email) where revoked_at is null;

-- Conversations --------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  guardian_id uuid,
  student_id uuid,
  contact_name text not null default '',   -- kept so the log still reads right if the contact is deleted
  last_message_at timestamptz,
  teacher_unread integer not null default 0,
  family_unread integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, teacher_id),
  check (guardian_id is null or student_id is null),
  -- Deleting a contact/pupil keeps the conversation (permanent record)
  foreign key (guardian_id, teacher_id) references public.guardians (id, teacher_id) on delete set null (guardian_id),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete set null (student_id)
);
create unique index conversations_guardian_unique on public.conversations (teacher_id, guardian_id) where guardian_id is not null;
create unique index conversations_student_unique on public.conversations (teacher_id, student_id) where student_id is not null;
create index conversations_teacher_idx on public.conversations (teacher_id, last_message_at desc);

-- Messages -----------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  conversation_id uuid not null,
  sender text not null check (sender in ('teacher', 'family')),
  sender_email text not null default '',   -- who actually wrote it (audit)
  body text not null check (length(trim(body)) > 0 and length(body) <= 5000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, teacher_id) references public.conversations (id, teacher_id) on delete cascade
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Keep conversation summary + unread counts in step with new messages
create or replace function public.bump_conversation()
returns trigger language plpgsql as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         teacher_unread = teacher_unread + case when new.sender = 'family' then 1 else 0 end,
         family_unread  = family_unread  + case when new.sender = 'teacher' then 1 else 0 end
   where id = new.conversation_id;
  return null;
end $$;

create trigger messages_bump after insert on public.messages
for each row execute function public.bump_conversation();

-- Messages are a permanent record: no edits (except read receipts), no deletes.
-- A cascade from deleting the conversation/teacher is still allowed.
create or replace function public.protect_messages()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.body is distinct from old.body or new.sender is distinct from old.sender
       or new.sender_email is distinct from old.sender_email or new.created_at is distinct from old.created_at
       or new.conversation_id is distinct from old.conversation_id then
      raise exception 'Messages cannot be edited';
    end if;
    return new;
  end if;
  if pg_trigger_depth() = 1 then
    raise exception 'Messages cannot be deleted';
  end if;
  return old;
end $$;

create trigger messages_protect before update or delete on public.messages
for each row execute function public.protect_messages();

-- Email log: two new kinds (family invites, "you have a new message" alerts) ----------
alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('reminder', 'broadcast', 'individual', 'invoice', 'lesson_notes', 'family_invite', 'message_notice'));

-- Lock down like every other table ---------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['family_access','conversations','messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
