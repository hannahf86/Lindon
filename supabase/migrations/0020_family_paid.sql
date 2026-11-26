-- =============================================================================
-- 0020_family_paid.sql — families can say "I've paid"
--
-- On a sent invoice, the parent (or adult pupil) taps "I've paid" (with an
-- optional note, e.g. "Bank transfer on 2 Dec"). The teacher is emailed and
-- the invoice shows "Family says paid" until the teacher confirms it with
-- Mark paid. Automatic overdue reminders skip invoices a family says are paid.
-- =============================================================================
alter table public.invoices
  add column if not exists family_paid_at timestamptz,
  add column if not exists family_paid_note text not null default '';

notify pgrst, 'reload schema';
