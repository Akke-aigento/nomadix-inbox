-- Drop all legacy/duplicate storage policies for brand-logos and brand-account-avatars
DROP POLICY IF EXISTS "Authenticated can delete brand logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update brand logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload brand logos" ON storage.objects;
DROP POLICY IF EXISTS "Public can read individual brand logos" ON storage.objects;
DROP POLICY IF EXISTS "brand-logos auth select" ON storage.objects;
DROP POLICY IF EXISTS "brand-account-avatars auth delete" ON storage.objects;
DROP POLICY IF EXISTS "brand-account-avatars auth insert" ON storage.objects;
DROP POLICY IF EXISTS "brand-account-avatars auth select" ON storage.objects;
DROP POLICY IF EXISTS "brand-account-avatars auth update" ON storage.objects;

-- Also drop and recreate our new ones to be safe and idempotent
DROP POLICY IF EXISTS "Public read brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Owner update brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Owner delete brand assets" ON storage.objects;

CREATE POLICY "Public read brand assets"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('brand-logos', 'brand-account-avatars'));

CREATE POLICY "Authenticated upload brand assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN ('brand-logos', 'brand-account-avatars')
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Owner update brand assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN ('brand-logos', 'brand-account-avatars')
    AND owner = auth.uid()
  )
  WITH CHECK (
    bucket_id IN ('brand-logos', 'brand-account-avatars')
    AND owner = auth.uid()
  );

CREATE POLICY "Owner delete brand assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('brand-logos', 'brand-account-avatars')
    AND owner = auth.uid()
  );