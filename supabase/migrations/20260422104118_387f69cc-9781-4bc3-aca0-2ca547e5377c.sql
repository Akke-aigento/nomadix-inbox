-- Drop overly broad public read policies and replace with per-bucket "view by direct path" semantics.
-- Public reads are still needed (img src), but we restrict broad listing by requiring auth for SELECT
-- and only allowing anon SELECT through the storage HTTP API which fetches by exact key.
-- Practically: we keep SELECT public (needed for <img>), the linter warning is acknowledged as
-- intentional for these public-asset buckets. Add explicit comment policies to silence by recreating
-- with a stricter pattern: anon can SELECT only specific objects, not list.
--
-- The cleanest fix: keep buckets public but ensure no LIST is possible by removing broad SELECT to anon.
-- Supabase storage uses SELECT for both fetch and list. To allow fetch but not list, we keep public=true
-- (which lets the storage API serve files via signed paths) and remove the broad SELECT policy.

DROP POLICY IF EXISTS "brand-account-avatars public read" ON storage.objects;
DROP POLICY IF EXISTS "Public read brand-logos" ON storage.objects;
DROP POLICY IF EXISTS "brand-logos public read" ON storage.objects;

-- Recreate with authenticated-only SELECT (prevents anonymous listing).
-- Public file URLs still work because public buckets serve files via the storage CDN
-- without requiring a SELECT policy match.
CREATE POLICY "brand-account-avatars auth select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'brand-account-avatars');

CREATE POLICY "brand-logos auth select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'brand-logos');