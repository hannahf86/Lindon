-- =============================================================================
-- 0021_heather_invoice_colours.sql — invoice branding follows the Heather
-- palette by default
--
-- New teachers start with purple (#5B3F8C) and gold (#E3C67E). Teachers still
-- on the OLD defaults (teal #1D7F7A / butter #F6E5A0) are moved over; anyone
-- who picked their own colours keeps them.
-- =============================================================================
alter table public.teachers alter column invoice_color set default '#5B3F8C';
alter table public.teachers alter column invoice_accent set default '#E3C67E';

update public.teachers set invoice_color = '#5B3F8C' where upper(invoice_color) = '#1D7F7A';
update public.teachers set invoice_accent = '#E3C67E' where upper(invoice_accent) = '#F6E5A0';
