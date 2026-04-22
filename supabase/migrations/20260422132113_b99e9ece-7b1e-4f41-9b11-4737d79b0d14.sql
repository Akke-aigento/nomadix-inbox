-- 1. Table
create table if not exists public.brand_email_addresses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  email_address text not null,
  is_primary boolean not null default false,
  is_catch_all boolean not null default false,
  catch_all_domain text,
  is_reply_default boolean not null default false,
  label text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Unique address (idempotent)
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'brand_email_addresses_email_address_key'
  ) then
    alter table public.brand_email_addresses
      add constraint brand_email_addresses_email_address_key unique (email_address);
  end if;
end $$;

-- Catch-all needs domain
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'catch_all_needs_domain'
  ) then
    alter table public.brand_email_addresses
      add constraint catch_all_needs_domain check (
        (is_catch_all = false) or
        (is_catch_all = true and catch_all_domain is not null and catch_all_domain <> '')
      );
  end if;
end $$;

-- Partial unique indexes
create unique index if not exists brand_email_one_primary
  on public.brand_email_addresses (brand_id) where is_primary = true;

create unique index if not exists brand_email_one_reply_default
  on public.brand_email_addresses (brand_id) where is_reply_default = true;

-- Lookup indexes
create index if not exists brand_email_addresses_email_idx on public.brand_email_addresses (email_address);
create index if not exists brand_email_addresses_catchall_idx on public.brand_email_addresses (catch_all_domain) where is_catch_all = true;
create index if not exists brand_email_addresses_brand_sort_idx on public.brand_email_addresses (brand_id, sort_order);

-- RLS
alter table public.brand_email_addresses enable row level security;

drop policy if exists "brand_email_addresses_owner_all" on public.brand_email_addresses;
create policy "brand_email_addresses_owner_all"
  on public.brand_email_addresses for all
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- 2. Migrate existing brands.email_address -> primary entries
insert into public.brand_email_addresses (
  owner_user_id, brand_id, email_address, is_primary, sort_order
)
select
  owner_user_id,
  id,
  lower(trim(email_address)),
  true,
  0
from public.brands
where email_address is not null and email_address <> ''
on conflict (email_address) do nothing;

-- 3. Sync trigger: keep brands.email_address mirrored to current primary
create or replace function public.sync_brand_primary_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_primary = true and new.is_catch_all = false then
    update public.brands
       set email_address = new.email_address
     where id = new.brand_id;
  end if;
  return new;
end;
$$;

drop trigger if exists brand_email_primary_sync on public.brand_email_addresses;
create trigger brand_email_primary_sync
  after insert or update of is_primary on public.brand_email_addresses
  for each row execute function public.sync_brand_primary_email();

-- 4. messages.matched_email_address column
alter table public.messages
  add column if not exists matched_email_address text;

create index if not exists messages_matched_email_idx on public.messages (matched_email_address);

-- 5. Seed extras for Nomadix brands (idempotent via unique on email_address)
insert into public.brand_email_addresses (owner_user_id, brand_id, email_address, is_catch_all, catch_all_domain, label, sort_order)
select owner_user_id, id, 'info@vanxcel.nl', false, null, null, 1
from public.brands where slug = 'vanxcel'
on conflict (email_address) do nothing;

insert into public.brand_email_addresses (owner_user_id, brand_id, email_address, is_catch_all, catch_all_domain, label, sort_order)
select owner_user_id, id, 'info@vanxcel.be', false, null, null, 2
from public.brands where slug = 'vanxcel'
on conflict (email_address) do nothing;

insert into public.brand_email_addresses (owner_user_id, brand_id, email_address, is_catch_all, catch_all_domain, label, sort_order)
select owner_user_id, id, '*@vanxcel.com', true, 'vanxcel.com', 'Catch-all NL+BE', 99
from public.brands where slug = 'vanxcel'
on conflict (email_address) do nothing;

insert into public.brand_email_addresses (owner_user_id, brand_id, email_address, is_catch_all, catch_all_domain, label, sort_order)
select owner_user_id, id, 'akke@studioakke.com', false, null, 'Mailbox', 1
from public.brands where slug = 'studioakke'
on conflict (email_address) do nothing;