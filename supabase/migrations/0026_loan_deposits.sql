-- =============================================================================
-- 0026_loan_deposits.sql — deposits on loans, and families saying "returned"
--
-- Deposit: an optional refundable amount when lending an item. It can be
--   added to the pupil's next invoice (deposit_invoiced) or marked as paid
--   another way (deposit_paid_on). When the item comes back the teacher
--   records whether the deposit was given back or kept (with a note).
-- Family return: the family taps "I've returned it" (optional note); the
--   teacher sees it and confirms with "Mark returned" as usual.
-- =============================================================================
alter table public.loans
  add column if not exists deposit numeric(10, 2) check (deposit >= 0),
  add column if not exists deposit_invoiced boolean not null default false,
  add column if not exists deposit_paid_on date,
  add column if not exists deposit_outcome text check (deposit_outcome in ('returned', 'kept')),
  add column if not exists deposit_note text not null default '',
  add column if not exists family_returned_at timestamptz,
  add column if not exists family_return_note text not null default '';

notify pgrst, 'reload schema';
