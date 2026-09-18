CREATE OR REPLACE FUNCTION public.upsert_email_account_password(account_id uuid, new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  existing_secret_id uuid;
  new_secret_id uuid;
  secret_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.email_accounts
    where id = account_id and owner_user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
  end if;

  select vault_secret_id into existing_secret_id
  from public.email_accounts where id = account_id;

  if existing_secret_id is not null then
    perform vault.update_secret(existing_secret_id, new_password);
  else
    secret_name := 'email_account_' || account_id::text;
    new_secret_id := vault.create_secret(new_password, secret_name, 'IMAP/SMTP password for email_account ' || account_id::text);
    update public.email_accounts
    set vault_secret_id = new_secret_id
    where id = account_id;
  end if;
end;
$function$;