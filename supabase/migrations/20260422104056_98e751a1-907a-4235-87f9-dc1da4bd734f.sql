-- 1. Brands: AI fields + default signature
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS brand_voice text,
  ADD COLUMN IF NOT EXISTS ai_auto_draft_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_draft_mode text NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS ai_draft_trigger_labels text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_draft_tone text NOT NULL DEFAULT 'professional',
  ADD COLUMN IF NOT EXISTS ai_draft_language text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS default_signature_html text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brands_ai_draft_mode_check'
  ) THEN
    ALTER TABLE public.brands
      ADD CONSTRAINT brands_ai_draft_mode_check
      CHECK (ai_draft_mode IN ('off', 'all_inbound', 'customer_only', 'labeled'));
  END IF;
END $$;

-- Backfill default_signature_html from existing signature_html where empty
UPDATE public.brands
  SET default_signature_html = signature_html
  WHERE default_signature_html IS NULL AND signature_html IS NOT NULL;

-- 2. brand_accounts table
CREATE TABLE IF NOT EXISTS public.brand_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  email_alias text,
  role_title text,
  avatar_url text,
  signature_html text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_accounts_brand_sort_idx
  ON public.brand_accounts (brand_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS brand_accounts_one_default_per_brand
  ON public.brand_accounts (brand_id) WHERE is_default = true;

ALTER TABLE public.brand_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_accounts' AND policyname = 'auth select brand_accounts') THEN
    CREATE POLICY "auth select brand_accounts" ON public.brand_accounts FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_accounts' AND policyname = 'auth insert brand_accounts') THEN
    CREATE POLICY "auth insert brand_accounts" ON public.brand_accounts FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_accounts' AND policyname = 'auth update brand_accounts') THEN
    CREATE POLICY "auth update brand_accounts" ON public.brand_accounts FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_accounts' AND policyname = 'auth delete brand_accounts') THEN
    CREATE POLICY "auth delete brand_accounts" ON public.brand_accounts FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DROP TRIGGER IF EXISTS set_brand_accounts_updated_at ON public.brand_accounts;
CREATE TRIGGER set_brand_accounts_updated_at
  BEFORE UPDATE ON public.brand_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. ai_drafts table
CREATE TABLE IF NOT EXISTS public.ai_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  brand_account_id uuid REFERENCES public.brand_accounts(id) ON DELETE SET NULL,
  draft_subject text,
  draft_body_html text NOT NULL,
  draft_body_text text,
  model_used text NOT NULL DEFAULT 'claude-sonnet-4-5',
  tokens_used int,
  generated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ready',
  reasoning text,
  UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS ai_drafts_status_idx ON public.ai_drafts (status);

ALTER TABLE public.ai_drafts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_drafts' AND policyname = 'auth select ai_drafts') THEN
    CREATE POLICY "auth select ai_drafts" ON public.ai_drafts FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_drafts' AND policyname = 'auth insert ai_drafts') THEN
    CREATE POLICY "auth insert ai_drafts" ON public.ai_drafts FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_drafts' AND policyname = 'auth update ai_drafts') THEN
    CREATE POLICY "auth update ai_drafts" ON public.ai_drafts FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_drafts' AND policyname = 'auth delete ai_drafts') THEN
    CREATE POLICY "auth delete ai_drafts" ON public.ai_drafts FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- 4. Messages: detection + AI fields
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS detected_via text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS detection_confidence numeric(3,2),
  ADD COLUMN IF NOT EXISTS ai_category text,
  ADD COLUMN IF NOT EXISTS ai_category_confidence numeric(3,2),
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS needs_reply boolean;

-- 5. Storage bucket for brand account avatars
INSERT INTO storage.buckets (id, name, public)
  VALUES ('brand-account-avatars', 'brand-account-avatars', true)
  ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'brand-account-avatars public read') THEN
    CREATE POLICY "brand-account-avatars public read" ON storage.objects FOR SELECT USING (bucket_id = 'brand-account-avatars');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'brand-account-avatars auth insert') THEN
    CREATE POLICY "brand-account-avatars auth insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'brand-account-avatars' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'brand-account-avatars auth update') THEN
    CREATE POLICY "brand-account-avatars auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'brand-account-avatars' AND auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'brand-account-avatars auth delete') THEN
    CREATE POLICY "brand-account-avatars auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'brand-account-avatars' AND auth.uid() IS NOT NULL);
  END IF;
END $$;