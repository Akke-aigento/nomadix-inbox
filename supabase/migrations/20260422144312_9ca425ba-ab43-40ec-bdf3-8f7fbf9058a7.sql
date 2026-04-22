ALTER TABLE public.threads
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS is_muted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_threads_snoozed_until
  ON public.threads (snoozed_until)
  WHERE snoozed_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_threads_is_muted
  ON public.threads (is_muted)
  WHERE is_muted = true;