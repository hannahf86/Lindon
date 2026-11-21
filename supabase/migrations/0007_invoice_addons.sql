-- =============================================================================
-- 0007_invoice_addons.sql — exam fees and instrument hire as invoice add-ons
--
-- · loans.hire_fee: monthly fee for an item out on paid hire (null = free loan)
-- · invoice_items gets two new kinds, 'exam' and 'hire', and links back to the
--   exam or loan so the same fee can't be billed twice. hire_month is the first
--   day of the month a hire line covers.
--
-- Lesson notes and in-app messaging have been removed from the app, but this
-- migration deliberately leaves their columns and tables in place, so nothing
-- already written is lost.
-- =============================================================================

-- Paid hire ---------------------------------------------------------------------
alter table public.loans add column hire_fee numeric(10, 2) check (hire_fee >= 0);

-- Needed for the composite foreign keys below -------------------------------------
alter table public.loans add constraint loans_id_teacher_key unique (id, teacher_id);
alter table public.exams add constraint exams_id_teacher_key unique (id, teacher_id);

-- New kinds of invoice line ---------------------------------------------------------
alter table public.invoice_items drop constraint invoice_items_kind_check;
alter table public.invoice_items add constraint invoice_items_kind_check
  check (kind in ('lesson', 'equipment', 'exam', 'hire', 'other', 'credit'));

-- Links back to what was billed (a deleted exam or loan leaves the line in place) ------
alter table public.invoice_items
  add column exam_id uuid,
  add column loan_id uuid,
  add column hire_month date,
  add constraint invoice_items_exam_id_teacher_id_fkey
    foreign key (exam_id, teacher_id) references public.exams (id, teacher_id) on delete set null (exam_id),
  add constraint invoice_items_loan_id_teacher_id_fkey
    foreign key (loan_id, teacher_id) references public.loans (id, teacher_id) on delete set null (loan_id);

create index invoice_items_exam_idx on public.invoice_items (exam_id) where exam_id is not null;
create index invoice_items_loan_idx on public.invoice_items (loan_id, hire_month) where loan_id is not null;

notify pgrst, 'reload schema';
