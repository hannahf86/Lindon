-- =============================================================================
-- 0029_student_auto_invoice.sql — turn auto-invoicing off for one student
--
-- teachers.auto_invoice is the overall switch (Invoices page). This per-student
-- switch overrides it: when false, that student's monthly invoice is still
-- drafted on the 1st but never emailed automatically, and no automatic
-- overdue reminder goes out for them — the teacher checks and sends it.
-- Default true = follow the overall setting.
-- =============================================================================
alter table public.students
  add column if not exists auto_invoice boolean not null default true;
