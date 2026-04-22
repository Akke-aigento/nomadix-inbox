
-- Fix function search path
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tighten storage policy: drop the broad SELECT, replace with a name-prefix policy.
-- Files are written under brand-logos/<filename>; clients can fetch a known path
-- but cannot list the bucket contents.
drop policy if exists "Public can read brand logos" on storage.objects;

create policy "Public can read individual brand logos"
on storage.objects for select
using (
  bucket_id = 'brand-logos'
  and name is not null
  and length(name) > 0
);
