ALTER TABLE public.sync_log
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS batch_complete boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS next_uid bigint;

CREATE INDEX IF NOT EXISTS idx_sync_log_account_status
  ON public.sync_log (email_account_id, status, started_at DESC);