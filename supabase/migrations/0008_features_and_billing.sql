-- =============================================================================
-- 0008_features_and_billing.sql — per-teacher feature switches, how they
-- charge, auto-invoicing and onboarding
--
-- · features: which optional parts of Lindon this teacher uses (see
--   lib/features.ts). New teachers pick theirs during onboarding; existing
--   teachers keep everything they already had.
-- · billing_mode: 'advance' = billed on the 1st for the month ahead, with
--   make-up credits for cancellations; 'arrears' = billed on the 1st for last
--   month's lessons that went ahead, so cancellations simply aren't charged and
--   no credits are issued.
-- · auto_invoice / last_invoice_run: on the 1st of each month the hourly job
--   drafts that month's invoices, and emails them too when auto_invoice is on.
--   Existing teachers start from this month, so the first run is next month.
-- · onboarded_at: null until the teacher has finished the welcome steps.
-- =============================================================================

alter table public.teachers
  add column features text[] not null default '{}',
  add column billing_mode text not null default 'advance' check (billing_mode in ('advance', 'arrears')),
  add column auto_invoice boolean not null default false,
  add column last_invoice_run text not null default to_char(now(), 'YYYY-MM'),
  add column onboarded_at timestamptz;

-- Existing teachers keep every feature they had
update public.teachers
   set features = array['family_logins', 'messaging', 'exams', 'library', 'equipment', 'reports'];

-- ---- Make-up credits only for teachers who bill in advance ---------------------------------
create or replace function public.sync_lesson_credit()
returns trigger language plpgsql as $$
declare
  eligible boolean := new.status in ('notice_given', 'teacher_cancelled')
    and new.price > 0
    and exists (select 1 from public.teachers t where t.id = new.teacher_id and t.billing_mode = 'advance');
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

notify pgrst, 'reload schema';
