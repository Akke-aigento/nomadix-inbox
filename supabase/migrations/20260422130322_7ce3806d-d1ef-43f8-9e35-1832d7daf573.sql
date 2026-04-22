-- 1. RPC: secure password fetch from vault
create or replace function public.get_email_account_password(p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_password text;
begin
  -- Service role bypasses ownership check; otherwise verify ownership
  if auth.role() <> 'service_role' then
    if not exists (
      select 1 from public.email_accounts
      where id = p_account_id and owner_user_id = auth.uid()
    ) then
      raise exception 'Forbidden: not owner of this account';
    end if;
  end if;

  select vault_secret_id into v_secret_id
  from public.email_accounts
  where id = p_account_id;

  if v_secret_id is null then
    raise exception 'No vault secret for account';
  end if;

  select decrypted_secret into v_password
  from vault.decrypted_secrets
  where id = v_secret_id;

  return v_password;
end;
$$;

grant execute on function public.get_email_account_password(uuid) to authenticated, service_role;

-- 2. Storage bucket for message attachments
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

-- 3. Storage policies: owner-scoped via path prefix
drop policy if exists "Owner read message attachments" on storage.objects;
drop policy if exists "Owner write message attachments" on storage.objects;
drop policy if exists "Owner update message attachments" on storage.objects;
drop policy if exists "Owner delete message attachments" on storage.objects;

create policy "Owner read message attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owner write message attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owner update message attachments"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owner delete message attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );