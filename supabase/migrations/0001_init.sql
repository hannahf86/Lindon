-- =============================================================================
-- 0001_init.sql — Lindon: full schema
--
-- Two parts:
--   1. next_auth schema  — tables the Auth.js Supabase adapter needs (users,
--      sessions, accounts, verification tokens). Expose this schema in
--      Supabase → Settings → API → "Exposed schemas" or sign-in will fail.
--   2. public schema     — the teaching data. Every row carries teacher_id.
--
-- Security model: the app talks to Supabase ONLY from the server, with the
-- service-role key, and scopes every query by the signed-in teacher's id.
-- RLS is switched on for every public table with NO policies, so the anon /
-- publishable key can read and write nothing at all.
--
-- Cross-tenant safety: child tables use composite foreign keys
-- (child_id, teacher_id) → parent(id, teacher_id), so the database itself
-- refuses to link one teacher's lesson to another teacher's student.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Part 1: Auth.js (next_auth schema)
-- -----------------------------------------------------------------------------
create schema if not exists next_auth;
grant usage on schema next_auth to service_role;
grant all on schema next_auth to postgres;

create table if not exists next_auth.users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text unique,
  "emailVerified" timestamptz,
  image text
);

create table if not exists next_auth.sessions (
  id uuid primary key default gen_random_uuid(),
  expires timestamptz not null,
  "sessionToken" text not null unique,
  "userId" uuid references next_auth.users (id) on delete cascade
);

create table if not exists next_auth.accounts (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  provider text not null,
  "providerAccountId" text not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text,
  oauth_token_secret text,
  oauth_token text,
  "userId" uuid references next_auth.users (id) on delete cascade,
  unique (provider, "providerAccountId")
);

create table if not exists next_auth.verification_tokens (
  identifier text,
  token text primary key,
  expires timestamptz not null,
  unique (token, identifier)
);

grant all on all tables in schema next_auth to postgres, service_role;

-- -----------------------------------------------------------------------------
-- Part 2: teaching data (public schema)
-- -----------------------------------------------------------------------------

-- Shared trigger: keep updated_at fresh -------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Teachers: one row per signed-in user (their studio profile + settings) ----
create table public.teachers (
  id uuid primary key references next_auth.users (id) on delete cascade,
  display_name text not null default '',
  business_name text not null default '',
  email text not null default '',            -- reply-to on every email sent
  phone text not null default '',
  address text not null default '',
  currency text not null default 'GBP',
  timezone text not null default 'Europe/London',
  invoice_prefix text not null default 'INV-',
  next_invoice_number integer not null default 1,
  invoice_terms_days integer not null default 14,
  payment_details text not null default '',  -- bank details etc. printed on invoices
  invoice_footer text not null default '',
  reminders_enabled boolean not null default true,
  reminder_hours_before integer not null default 24 check (reminder_hours_before between 1 and 168),
  reminder_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contacts: parents / guardians of under-18 students ------------------------
create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);

-- Students ------------------------------------------------------------------
-- Under-18s are contacted through linked guardians; 18+ through their own
-- email/phone. If date_of_birth is set it decides; otherwise is_minor does.
create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  date_of_birth date,
  is_minor boolean not null default true,
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  instruments text[] not null default '{}',  -- free text, typed by the teacher
  level text not null default '',
  status text not null default 'active' check (status in ('active', 'paused', 'left')),
  start_date date,
  reminders_enabled boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);

-- Student ↔ guardian links (many-to-many: siblings share parents) -----------
create table public.student_guardians (
  teacher_id uuid not null,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship text not null default '',
  is_primary boolean not null default false,
  receives_emails boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (student_id, guardian_id),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade,
  foreign key (guardian_id, teacher_id) references public.guardians (id, teacher_id) on delete cascade
);

-- Time slots: the weekly timetable, each with a price and (optionally) a student
create table public.time_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),  -- ISO: 1 = Monday
  start_time time not null,
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  price numeric(10, 2) not null default 0 check (price >= 0),
  label text not null default '',
  instrument text not null default '',
  location text not null default '',
  student_id uuid,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete set null (student_id)
);

-- Lessons: actual dated occurrences (generated from slots, or one-off) ------
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  student_id uuid not null,
  time_slot_id uuid,
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  price numeric(10, 2) not null default 0 check (price >= 0),
  instrument text not null default '',
  location text not null default '',
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  chargeable boolean not null default true,   -- e.g. late cancellations can still be billed
  notes text not null default '',             -- lesson notes
  homework text not null default '',
  notes_emailed_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade,
  foreign key (time_slot_id, teacher_id) references public.time_slots (id, teacher_id) on delete set null (time_slot_id)
);
-- A slot can only produce one lesson at a given start time (safe re-generation)
create unique index lessons_slot_start_unique on public.lessons (time_slot_id, starts_at) where time_slot_id is not null;

-- Invoices --------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  student_id uuid,
  number text not null,
  bill_to_name text not null default '',
  bill_to_email text not null default '',
  bill_to_address text not null default '',
  issue_date date not null default current_date,
  due_date date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  sent_at timestamptz,
  paid_on date,
  payment_method text not null default '',
  notes text not null default '',
  total numeric(10, 2) not null default 0,    -- kept in sync by trigger below
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id),
  unique (teacher_id, number),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete set null (student_id)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  invoice_id uuid not null,
  kind text not null default 'lesson' check (kind in ('lesson', 'equipment', 'other')),
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(10, 2) not null default 0,
  amount numeric(10, 2) generated always as (round(quantity * unit_price, 2)) stored,
  lesson_id uuid,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, teacher_id) references public.invoices (id, teacher_id) on delete cascade,
  foreign key (lesson_id, teacher_id) references public.lessons (id, teacher_id) on delete set null (lesson_id)
);
create index invoice_items_lesson_idx on public.invoice_items (lesson_id) where lesson_id is not null;

-- Keep invoices.total equal to the sum of its items
create or replace function public.recalc_invoice_total()
returns trigger language plpgsql as $$
declare
  target uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices
     set total = coalesce((select sum(amount) from public.invoice_items where invoice_id = target), 0)
   where id = target;
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    update public.invoices
       set total = coalesce((select sum(amount) from public.invoice_items where invoice_id = old.invoice_id), 0)
     where id = old.invoice_id;
  end if;
  return null;
end $$;

create trigger invoice_items_total
after insert or update or delete on public.invoice_items
for each row execute function public.recalc_invoice_total();

-- Hand out the next invoice number atomically (no duplicates under load)
create or replace function public.next_invoice_number(p_teacher uuid)
returns text language plpgsql as $$
declare
  n integer;
  prefix text;
begin
  update public.teachers
     set next_invoice_number = next_invoice_number + 1
   where id = p_teacher
  returning next_invoice_number - 1, invoice_prefix into n, prefix;
  return prefix || lpad(n::text, 4, '0');
end $$;

-- Library: books and equipment the teacher lends out -----------------------
create table public.library_items (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  title text not null,
  kind text not null default '',              -- typed: "Book", "Violin 1/2", "Music stand"...
  identifier text not null default '',        -- serial number / ISBN / label
  condition text not null default '',
  value numeric(10, 2),
  notes text not null default '',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  item_id uuid not null,
  student_id uuid not null,
  lent_on date not null default current_date,
  due_on date,
  returned_on date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, teacher_id) references public.library_items (id, teacher_id) on delete cascade,
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade
);
-- An item can only be out with one student at a time
create unique index loans_one_open_per_item on public.loans (item_id) where returned_on is null;

-- Exams -----------------------------------------------------------------------
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  student_id uuid not null,
  instrument text not null default '',
  board text not null default '',             -- typed: ABRSM, Trinity, RSL...
  grade text not null default '',
  exam_date date,
  exam_time time,
  venue text not null default '',
  entry_deadline date,
  fee numeric(10, 2),
  status text not null default 'planned' check (status in ('planned', 'entered', 'taken', 'withdrawn')),
  result text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade
);

-- Email log: every message the app sends ----------------------------------
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  kind text not null check (kind in ('reminder', 'broadcast', 'individual', 'invoice', 'lesson_notes')),
  subject text not null,
  body text not null default '',
  recipients text[] not null default '{}',
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  lesson_id uuid,
  invoice_id uuid,
  created_at timestamptz not null default now()
);

-- Indexes for the common lookups ---------------------------------------------
create index guardians_teacher_idx on public.guardians (teacher_id);
create index students_teacher_idx on public.students (teacher_id, status);
create index student_guardians_guardian_idx on public.student_guardians (guardian_id);
create index time_slots_teacher_idx on public.time_slots (teacher_id, day_of_week, start_time);
create index lessons_teacher_start_idx on public.lessons (teacher_id, starts_at);
create index lessons_student_idx on public.lessons (student_id, starts_at);
create index invoices_teacher_idx on public.invoices (teacher_id, issue_date);
create index invoice_items_invoice_idx on public.invoice_items (invoice_id);
create index library_items_teacher_idx on public.library_items (teacher_id);
create index loans_teacher_idx on public.loans (teacher_id, returned_on);
create index exams_teacher_idx on public.exams (teacher_id, exam_date);
create index email_log_teacher_idx on public.email_log (teacher_id, created_at desc);

-- updated_at triggers -------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['teachers','guardians','students','time_slots','lessons','invoices','library_items','loans','exams']
  loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- Lock everything down: RLS on, no policies, no grants to client roles ------
do $$
declare t text;
begin
  foreach t in array array['teachers','guardians','students','student_guardians','time_slots','lessons','invoices','invoice_items','library_items','loans','exams','email_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke execute on function public.next_invoice_number(uuid) from public, anon, authenticated;
grant execute on function public.next_invoice_number(uuid) to service_role;

-- Tell the Supabase API to pick up the new tables straight away
notify pgrst, 'reload schema';
