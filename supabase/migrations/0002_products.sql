-- =============================================================================
-- 0002_products.sql — Equipment for sale (strings, reeds, books, rosin…)
--
-- products: the teacher's catalogue, with a selling price, optional cost price
-- and optional stock count.
-- invoice_items.product_id: a sale is just an invoice line linked to a product,
-- so sales flow through invoices and income reports like everything else.
--
-- Stock is kept right by triggers, so it can't drift:
--   • adding / changing / removing a linked invoice line adjusts stock
--   • voiding an invoice puts its items back; un-voiding takes them out again
-- Stock only changes for products with track_stock = true.
-- =============================================================================

-- Products ----------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  name text not null,
  category text not null default '',         -- typed: "Strings", "Reeds", "Books"…
  sku text not null default '',              -- supplier code / barcode, optional
  price numeric(10, 2) not null default 0 check (price >= 0),
  cost numeric(10, 2) check (cost >= 0),     -- what the teacher paid, for margin
  track_stock boolean not null default false,
  stock integer not null default 0,
  low_stock_at integer,                      -- warn when stock falls to this
  notes text not null default '',
  active boolean not null default true,      -- hidden items stay on old invoices
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, teacher_id)
);
create index products_teacher_idx on public.products (teacher_id, active, name);

create trigger products_touch before update on public.products
for each row execute function public.touch_updated_at();

-- Link invoice lines to products --------------------------------------------------
alter table public.invoice_items add column product_id uuid;
alter table public.invoice_items
  add constraint invoice_items_product_id_teacher_id_fkey
  foreign key (product_id, teacher_id) references public.products (id, teacher_id) on delete set null (product_id);
create index invoice_items_product_idx on public.invoice_items (product_id) where product_id is not null;

-- Stock: invoice lines ---------------------------------------------------------------
-- Lines on a void invoice don't count as sold, so they never move stock.
create or replace function public.adjust_stock_for_item()
returns trigger language plpgsql as $$
declare
  inv_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.product_id is not null then
    select status into inv_status from public.invoices where id = old.invoice_id;
    -- invoice already gone = cascade from deleting it; handled by the
    -- invoices_stock_on_delete trigger below, so do nothing here
    if coalesce(inv_status, 'void') <> 'void' then
      update public.products set stock = stock + round(old.quantity)::int
       where id = old.product_id and track_stock;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.product_id is not null then
    select status into inv_status from public.invoices where id = new.invoice_id;
    if coalesce(inv_status, 'void') <> 'void' then
      update public.products set stock = stock - round(new.quantity)::int
       where id = new.product_id and track_stock;
    end if;
  end if;
  return null;
end $$;

create trigger invoice_items_stock
after insert or update of quantity, product_id or delete on public.invoice_items
for each row execute function public.adjust_stock_for_item();

-- Stock: voiding / un-voiding an invoice ----------------------------------------------
create or replace function public.adjust_stock_for_void()
returns trigger language plpgsql as $$
declare
  direction int;
begin
  if new.status = 'void' and old.status <> 'void' then
    direction := 1;   -- sale cancelled: back on the shelf
  elsif old.status = 'void' and new.status <> 'void' then
    direction := -1;  -- invoice revived: sold again
  else
    return null;
  end if;
  update public.products p
     set stock = p.stock + direction * s.qty
    from (
      select product_id, sum(round(quantity)::int) as qty
        from public.invoice_items
       where invoice_id = new.id and product_id is not null
       group by product_id
    ) s
   where p.id = s.product_id and p.track_stock;
  return null;
end $$;

create trigger invoices_stock_on_void
after update of status on public.invoices
for each row execute function public.adjust_stock_for_void();

-- Stock: deleting a whole invoice -----------------------------------------------------
-- Runs before the cascade removes its lines. A void invoice's stock was
-- already returned when it was voided, so only non-void invoices restock.
create or replace function public.restock_deleted_invoice()
returns trigger language plpgsql as $$
begin
  if old.status <> 'void' then
    update public.products p
       set stock = p.stock + s.qty
      from (
        select product_id, sum(round(quantity)::int) as qty
          from public.invoice_items
         where invoice_id = old.id and product_id is not null
         group by product_id
      ) s
     where p.id = s.product_id and p.track_stock;
  end if;
  return old;
end $$;

create trigger invoices_stock_on_delete
before delete on public.invoices
for each row execute function public.restock_deleted_invoice();

-- Lock down like every other table -----------------------------------------------------
alter table public.products enable row level security;
revoke all on public.products from anon, authenticated;

notify pgrst, 'reload schema';
