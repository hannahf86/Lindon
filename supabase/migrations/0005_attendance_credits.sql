-- =============================================================================
-- 0005_attendance_credits.sql — attendance + make-up credits
--
-- Lesson status becomes attendance:
--   scheduled          not happened yet
--   present            taught                         (charged)
--   absent             no-show, no notice             (charged, no credit)
--   notice_given       pupil cancelled with notice    (charged, +1 make-up credit)
--   teacher_cancelled  teacher cancelled              (charged, +1 make-up credit)
-- Lessons are billed monthly in advance, so every lesson is charged; a credit
-- (worth that lesson's price) then comes off the pupil's NEXT invoice.
--
-- lesson_credits: one row per credit. invoice_item_id is the minus line on
-- the invoice that used it — NULL means the credit is still available.
-- Removing that line (or deleting / voiding the invoice) frees the credit.
-- Credits never expire.
-- =============================================================================

-- ---- Attendance statuses -----------------------------------------------------------
alter table public.lessons drop constraint lessons_status_check;
update public.lessons set status = 'present' where status = 'completed';
update public.lessons set status = 'absent' where status = 'no_show';
update public.lessons set status = 'notice_given' where status = 'cancelled';   -- old cancellations: no credit created retroactively
alter table public.lessons add constraint lessons_status_check
  check (status in ('scheduled', 'present', 'absent', 'notice_given', 'teacher_cancelled'));

-- ---- Invoice lines can be credits (negative) --------------------------------------
alter table public.invoice_items drop constraint invoice_items_kind_check;
alter table public.invoice_items add constraint invoice_items_kind_check
  check (kind in ('lesson', 'equipment', 'other', 'credit'));
alter table public.invoice_items add constraint invoice_items_id_teacher_unique unique (id, teacher_id);

-- ---- Credits ---------------------------------------------------------------------------
create table public.lesson_credits (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  student_id uuid not null,
  lesson_id uuid unique,                     -- the missed lesson (null for a manual credit)
  amount numeric(10, 2) not null check (amount >= 0),
  reason text not null check (reason in ('notice_given', 'teacher_cancelled', 'manual')),
  note text not null default '',
  invoice_item_id uuid unique,               -- the invoice line that used it (null = available)
  created_at timestamptz not null default now(),
  foreign key (student_id, teacher_id) references public.students (id, teacher_id) on delete cascade,
  foreign key (lesson_id, teacher_id) references public.lessons (id, teacher_id) on delete cascade,
  foreign key (invoice_item_id, teacher_id) references public.invoice_items (id, teacher_id) on delete set null (invoice_item_id)
);
create index lesson_credits_student_idx on public.lesson_credits (teacher_id, student_id) where invoice_item_id is null;

-- ---- Credits follow attendance automatically -------------------------------------------
-- notice_given / teacher_cancelled → a credit exists (worth the lesson price)
-- any other status                 → an UNUSED credit is removed
--   (a credit that's already on an invoice is left alone — it was given)
create or replace function public.sync_lesson_credit()
returns trigger language plpgsql as $$
declare
  eligible boolean := new.status in ('notice_given', 'teacher_cancelled') and new.price > 0;
begin
  if eligible then
    insert into public.lesson_credits (teacher_id, student_id, lesson_id, amount, reason)
    values (new.teacher_id, new.student_id, new.id, new.price, new.status)
    on conflict (lesson_id) do update
       set amount = excluded.amount, reason = excluded.reason, student_id = excluded.student_id
     where public.lesson_credits.invoice_item_id is null;
  else
    delete from public.lesson_credits where lesson_id = new.id and invoice_item_id is null;
  end if;
  return null;
end $$;

create trigger lessons_credit_sync
after insert or update of status, price, student_id on public.lessons
for each row execute function public.sync_lesson_credit();

-- ---- Voiding an invoice frees its credits; reopening re-claims any still free ---------
create or replace function public.credits_on_void()
returns trigger language plpgsql as $$
begin
  if new.status = 'void' and old.status <> 'void' then
    update public.lesson_credits set invoice_item_id = null
     where invoice_item_id in (select id from public.invoice_items where invoice_id = new.id);
  elsif old.status = 'void' and new.status <> 'void' then
    -- Re-link credit lines to their credit only if nobody else has used it since
    update public.lesson_credits c set invoice_item_id = i.id
      from public.invoice_items i
     where i.invoice_id = new.id and i.kind = 'credit' and i.credit_id = c.id and c.invoice_item_id is null;
  end if;
  return null;
end $$;

-- invoice_items remembers which credit a minus line came from (for re-linking)
alter table public.invoice_items add column credit_id uuid;

create trigger invoices_credits_on_void
after update of status on public.invoices
for each row execute function public.credits_on_void();

-- ---- Email log: "you've got a make-up credit" emails ------------------------------------
alter table public.email_log drop constraint email_log_kind_check;
alter table public.email_log add constraint email_log_kind_check
  check (kind in ('reminder', 'broadcast', 'individual', 'invoice', 'lesson_notes', 'family_invite', 'message_notice', 'credit_notice'));

-- ---- Lock down ---------------------------------------------------------------------------
alter table public.lesson_credits enable row level security;
revoke all on public.lesson_credits from anon, authenticated;

notify pgrst, 'reload schema';
