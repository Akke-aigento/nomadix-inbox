-- 1. brand_categories
CREATE TABLE IF NOT EXISTS public.brand_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  emoji text,
  color text NOT NULL DEFAULT '#64748B',
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_ai_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, slug)
);

CREATE INDEX IF NOT EXISTS brand_categories_brand_sort_idx
  ON public.brand_categories (brand_id, sort_order);

ALTER TABLE public.brand_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_categories' AND policyname = 'auth select brand_categories') THEN
    CREATE POLICY "auth select brand_categories" ON public.brand_categories FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_categories' AND policyname = 'auth insert brand_categories') THEN
    CREATE POLICY "auth insert brand_categories" ON public.brand_categories FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_categories' AND policyname = 'auth update brand_categories') THEN
    CREATE POLICY "auth update brand_categories" ON public.brand_categories FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'brand_categories' AND policyname = 'auth delete brand_categories') THEN
    CREATE POLICY "auth delete brand_categories" ON public.brand_categories FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- 2. message_categories
CREATE TABLE IF NOT EXISTS public.message_categories (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.brand_categories(id) ON DELETE CASCADE,
  confidence numeric(3,2),
  detected_via text NOT NULL DEFAULT 'ai',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, category_id)
);

CREATE INDEX IF NOT EXISTS message_categories_category_idx
  ON public.message_categories (category_id);

ALTER TABLE public.message_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_categories' AND policyname = 'auth select message_categories') THEN
    CREATE POLICY "auth select message_categories" ON public.message_categories FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_categories' AND policyname = 'auth insert message_categories') THEN
    CREATE POLICY "auth insert message_categories" ON public.message_categories FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_categories' AND policyname = 'auth update message_categories') THEN
    CREATE POLICY "auth update message_categories" ON public.message_categories FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_categories' AND policyname = 'auth delete message_categories') THEN
    CREATE POLICY "auth delete message_categories" ON public.message_categories FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- 3. messages: extra filter columns
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS requires_action boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sender_type text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_urgency_check') THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_urgency_check
      CHECK (urgency IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END $$;

-- 4. routing_rules
CREATE TABLE IF NOT EXISTS public.routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,

  match_from_contains text,
  match_subject_contains text,
  match_to_contains text,
  match_has_header text,
  match_brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,

  action_add_category_id uuid REFERENCES public.brand_categories(id) ON DELETE SET NULL,
  action_add_label_id uuid REFERENCES public.labels(id) ON DELETE SET NULL,
  action_set_urgency text,
  action_mark_read boolean NOT NULL DEFAULT false,
  action_archive boolean NOT NULL DEFAULT false,

  times_matched int NOT NULL DEFAULT 0,
  last_matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS routing_rules_priority_idx
  ON public.routing_rules (priority) WHERE is_active = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routing_rules_action_urgency_check') THEN
    ALTER TABLE public.routing_rules
      ADD CONSTRAINT routing_rules_action_urgency_check
      CHECK (action_set_urgency IS NULL OR action_set_urgency IN ('low', 'normal', 'high', 'urgent'));
  END IF;
END $$;

ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'routing_rules' AND policyname = 'auth select routing_rules') THEN
    CREATE POLICY "auth select routing_rules" ON public.routing_rules FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'routing_rules' AND policyname = 'auth insert routing_rules') THEN
    CREATE POLICY "auth insert routing_rules" ON public.routing_rules FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'routing_rules' AND policyname = 'auth update routing_rules') THEN
    CREATE POLICY "auth update routing_rules" ON public.routing_rules FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'routing_rules' AND policyname = 'auth delete routing_rules') THEN
    CREATE POLICY "auth delete routing_rules" ON public.routing_rules FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
  END IF;
END $$;