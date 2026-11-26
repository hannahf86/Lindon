-- =============================================================================
-- 0016_invoice_auto_reminders.sql — automatic payment reminders
--
-- Teachers with auto-invoicing on: a sent invoice that's 7 days past its due
-- date gets one payment reminder emailed automatically (lib/invoice-reminders,
-- hourly cron, from 9am the teacher's time). auto_reminder_sent_at stops it
-- being sent twice.
-- =============================================================================
alter table public.invoices add column if not exists auto_reminder_sent_at timestamptz;

notify pgrst, 'reload schema';
