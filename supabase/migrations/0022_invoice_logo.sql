-- =============================================================================
-- 0022_invoice_logo.sql — the teacher's logo on invoices (PDF, print, emails)
--
-- Uploaded in Settings → Invoicing → Logo (PNG or JPG). Files live in a
-- public Storage bucket "logos" (logos have to be reachable from invoice
-- emails, so the bucket is public; paths include a random part). Only the
-- server (service role) uploads or removes files.
-- =============================================================================
alter table public.teachers add column if not exists logo_url text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
