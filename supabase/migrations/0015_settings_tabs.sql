-- =============================================================================
-- 0015_settings_tabs.sql — new settings for the tabbed Settings page
--
-- Invoicing → branding: the main colour and accent stripe used on printed /
--   PDF invoices and invoice emails.
-- Communication → exam reminders: email families N days before an exam
--   (exams feature on); exams.exam_reminder_sent_at stops repeats.
-- Communication → messages: email the teacher when a family sends a message.
-- =============================================================================
alter table public.teachers
  add column if not exists invoice_color text not null default '#1D7F7A' check (invoice_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists invoice_accent text not null default '#F6E5A0' check (invoice_accent ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists exam_reminders_enabled boolean not null default true,
  add column if not exists exam_reminder_days integer not null default 7 check (exam_reminder_days between 1 and 60),
  add column if not exists message_alerts boolean not null default true;

alter table public.exams add column if not exists exam_reminder_sent_at timestamptz;

notify pgrst, 'reload schema';
