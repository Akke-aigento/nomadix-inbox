
-- Enable required extensions
create extension if not exists "pgcrypto";
create extension if not exists "supabase_vault";

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. BRANDS
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  email_address text unique not null,
  display_name text not null,
  color_primary text not null default '#3B82F6',
  logo_url text,
  signature_html text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

-- 2. EMAIL ACCOUNTS
create table public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  imap_host text not null default 'imap.migadu.com',
  imap_port int not null default 993,
  imap_use_tls boolean not null default true,
  smtp_host text not null default 'smtp.migadu.com',
  smtp_port int not null default 465,
  smtp_use_tls boolean not null default true,
  username text not null,
  vault_secret_id uuid,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger email_accounts_updated_at before update on public.email_accounts
  for each row execute function public.set_updated_at();

-- 3. THREADS
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  subject text,
  preview text,
  message_count int not null default 0,
  unread_count int not null default 0,
  has_attachments boolean not null default false,
  is_starred boolean not null default false,
  is_archived boolean not null default false,
  last_message_at timestamptz,
  participants jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index threads_brand_last on public.threads (brand_id, last_message_at desc);
create index threads_archived_last on public.threads (is_archived, last_message_at desc);
create trigger threads_updated_at before update on public.threads
  for each row execute function public.set_updated_at();

-- 4. MESSAGES
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.threads(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  email_account_id uuid references public.email_accounts(id) on delete set null,
  imap_uid bigint,
  imap_folder text default 'INBOX',
  message_id_header text unique,
  in_reply_to text,
  from_address text not null,
  from_name text,
  to_addresses jsonb not null default '[]'::jsonb,
  cc_addresses jsonb not null default '[]'::jsonb,
  bcc_addresses jsonb not null default '[]'::jsonb,
  reply_to text,
  subject text,
  body_html text,
  body_text text,
  received_at timestamptz not null,
  is_read boolean not null default false,
  is_outbound boolean not null default false,
  raw_headers jsonb,
  created_at timestamptz not null default now()
);
create index messages_thread_received on public.messages (thread_id, received_at desc);
create index messages_brand_received on public.messages (brand_id, received_at desc);
create index messages_is_read on public.messages (is_read);
create index messages_message_id_header on public.messages (message_id_header);

-- 5. ATTACHMENTS
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  content_id text,
  is_inline boolean not null default false,
  storage_path text,
  created_at timestamptz not null default now()
);

-- 6. DRAFTS
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  in_reply_to_message_id uuid references public.messages(id) on delete set null,
  to_addresses jsonb not null default '[]'::jsonb,
  cc_addresses jsonb not null default '[]'::jsonb,
  bcc_addresses jsonb not null default '[]'::jsonb,
  subject text,
  body_html text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger drafts_updated_at before update on public.drafts
  for each row execute function public.set_updated_at();

-- 7. LABELS
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#64748B',
  created_at timestamptz not null default now()
);

-- 8. THREAD_LABELS
create table public.thread_labels (
  thread_id uuid references public.threads(id) on delete cascade,
  label_id uuid references public.labels(id) on delete cascade,
  primary key (thread_id, label_id)
);

-- 9. SYNC_LOG
create table public.sync_log (
  id uuid primary key default gen_random_uuid(),
  email_account_id uuid references public.email_accounts(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text,
  messages_fetched int default 0,
  highest_uid_seen bigint,
  error_message text
);

-- ENABLE RLS
alter table public.brands enable row level security;
alter table public.email_accounts enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.drafts enable row level security;
alter table public.labels enable row level security;
alter table public.thread_labels enable row level security;
alter table public.sync_log enable row level security;

-- POLICIES: any authenticated user can do anything (single-user app)
do $$
declare
  t text;
begin
  for t in select unnest(array['brands','email_accounts','threads','messages','attachments','drafts','labels','thread_labels','sync_log'])
  loop
    execute format('create policy "auth select %I" on public.%I for select to authenticated using (auth.uid() is not null);', t, t);
    execute format('create policy "auth insert %I" on public.%I for insert to authenticated with check (auth.uid() is not null);', t, t);
    execute format('create policy "auth update %I" on public.%I for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);', t, t);
    execute format('create policy "auth delete %I" on public.%I for delete to authenticated using (auth.uid() is not null);', t, t);
  end loop;
end$$;

-- STORAGE BUCKET for brand logos
insert into storage.buckets (id, name, public)
values ('brand-logos', 'brand-logos', true)
on conflict (id) do nothing;

create policy "Public can read brand logos"
on storage.objects for select
using (bucket_id = 'brand-logos');

create policy "Authenticated can upload brand logos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'brand-logos');

create policy "Authenticated can update brand logos"
on storage.objects for update
to authenticated
using (bucket_id = 'brand-logos');

create policy "Authenticated can delete brand logos"
on storage.objects for delete
to authenticated
using (bucket_id = 'brand-logos');

-- VAULT helpers
-- Save (insert or update) a password in Vault and link it to an email account
create or replace function public.upsert_email_account_password(
  account_id uuid,
  new_password text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  existing_secret_id uuid;
  new_secret_id uuid;
  secret_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select vault_secret_id into existing_secret_id
  from public.email_accounts where id = account_id;

  if existing_secret_id is not null then
    -- update existing
    update vault.secrets
    set secret = new_password
    where id = existing_secret_id;
  else
    secret_name := 'email_account_' || account_id::text;
    new_secret_id := vault.create_secret(new_password, secret_name, 'IMAP/SMTP password for email_account ' || account_id::text);
    update public.email_accounts
    set vault_secret_id = new_secret_id
    where id = account_id;
  end if;
end;
$$;

revoke all on function public.upsert_email_account_password(uuid, text) from public;
grant execute on function public.upsert_email_account_password(uuid, text) to authenticated;

-- Edge-function-only: read a secret. Service role bypasses the auth check.
create or replace function public.get_vault_secret(secret_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  s text;
begin
  select decrypted_secret into s
  from vault.decrypted_secrets
  where id = secret_id;
  return s;
end;
$$;

revoke all on function public.get_vault_secret(uuid) from public, anon, authenticated;
