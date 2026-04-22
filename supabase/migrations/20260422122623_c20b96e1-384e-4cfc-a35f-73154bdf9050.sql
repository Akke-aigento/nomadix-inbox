-- Tighten storage policies: require user-owned path prefix for brand-logos and brand-account-avatars
drop policy if exists "Authenticated upload brand assets" on storage.objects;
drop policy if exists "Authenticated update brand assets" on storage.objects;
drop policy if exists "Authenticated delete brand assets" on storage.objects;

create policy "Owner-scoped brand asset uploads"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('brand-logos','brand-account-avatars')
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owner-scoped brand asset updates"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('brand-logos','brand-account-avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('brand-logos','brand-account-avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Owner-scoped brand asset deletes"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('brand-logos','brand-account-avatars')
    and (storage.foldername(name))[1] = auth.uid()::text
  );