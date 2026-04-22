-- =====================================================================
-- STEP 1: Add owner_user_id to every data table
-- =====================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'brands','email_accounts','threads','messages','attachments',
    'drafts','labels','thread_labels','ai_drafts','brand_accounts',
    'brand_categories','message_categories','routing_rules','sync_log'
  ];
  first_user uuid;
BEGIN
  SELECT id INTO first_user FROM auth.users ORDER BY created_at LIMIT 1;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE',
      t
    );
    IF first_user IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.%I SET owner_user_id = %L WHERE owner_user_id IS NULL',
        t, first_user
      );
    END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN owner_user_id SET NOT NULL',
      t
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN owner_user_id SET DEFAULT auth.uid()',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(owner_user_id)',
      t || '_owner_idx', t
    );
  END LOOP;
END $$;

-- =====================================================================
-- STEP 2: Drop old permissive policies and create strict owner-only ones
-- =====================================================================

DO $$
DECLARE
  t text;
  pol record;
  tables text[] := ARRAY[
    'brands','email_accounts','threads','messages','attachments',
    'drafts','labels','thread_labels','ai_drafts','brand_accounts',
    'brand_categories','message_categories','routing_rules','sync_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop ALL existing policies for the table
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- Create one strict owner policy covering all commands
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid())',
      t || '_owner_all', t
    );
  END LOOP;
END $$;

-- =====================================================================
-- STEP 3: Tighten upsert_email_account_password RPC with ownership check
-- =====================================================================

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
$function$;

-- =====================================================================
-- STEP 4: Storage policies for brand-logos + brand-account-avatars
-- =====================================================================

-- Drop any existing custom policies for these buckets to make idempotent
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN (
        'Public read brand assets',
        'Authenticated upload brand assets',
        'Owner update brand assets',
        'Owner delete brand assets'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

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
  );

CREATE POLICY "Owner delete brand assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('brand-logos', 'brand-account-avatars')
    AND owner = auth.uid()
  );