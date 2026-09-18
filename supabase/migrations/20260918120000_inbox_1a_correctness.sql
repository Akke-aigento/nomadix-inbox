-- INBOX-1a — correctheid (audit 2026-09-18). Idempotent: veilig om opnieuw te draaien.

-- ─── DATA-4: threads.unread_count volgt messages.is_read ───
-- Invoker-rechten: RLS blijft gelden (threads_owner_all dekt UPDATE voor de owner);
-- de sync draait als service_role en omzeilt RLS sowieso.
CREATE OR REPLACE FUNCTION public.recompute_thread_unread()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.thread_id IS NOT NULL THEN
    UPDATE public.threads t
       SET unread_count = (SELECT count(*) FROM public.messages m
                            WHERE m.thread_id = NEW.thread_id AND NOT m.is_read)
     WHERE t.id = NEW.thread_id;
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.thread_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR OLD.thread_id IS DISTINCT FROM NEW.thread_id) THEN
    UPDATE public.threads t
       SET unread_count = (SELECT count(*) FROM public.messages m
                            WHERE m.thread_id = OLD.thread_id AND NOT m.is_read)
     WHERE t.id = OLD.thread_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS messages_unread_sync ON public.messages;
CREATE TRIGGER messages_unread_sync
AFTER INSERT OR DELETE OR UPDATE OF is_read, thread_id ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.recompute_thread_unread();

-- Eenmalige correctie van scheve tellers (166 op 18-09).
UPDATE public.threads t
   SET unread_count = s.c
  FROM (SELECT th.id, (SELECT count(*) FROM public.messages m
                        WHERE m.thread_id = th.id AND NOT m.is_read) AS c
          FROM public.threads th) s
 WHERE s.id = t.id AND t.unread_count IS DISTINCT FROM s.c;

-- ─── DATA-3: sidebar-tellers server-side (geen 1000-rijenlimiet) ───
CREATE OR REPLACE FUNCTION public.sidebar_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH active AS (
    SELECT brand_id
      FROM public.threads
     WHERE NOT is_archived
       AND NOT is_muted
       AND (snoozed_until IS NULL OR snoozed_until <= now())
       AND unread_count > 0
  )
  SELECT jsonb_build_object(
    'perBrand', COALESCE((SELECT jsonb_object_agg(brand_id, n)
                            FROM (SELECT brand_id, count(*) AS n FROM active
                                   WHERE brand_id IS NOT NULL GROUP BY brand_id) b), '{}'::jsonb),
    'totalUnread', (SELECT count(*) FROM active),
    'snoozed', (SELECT count(*) FROM public.threads
                 WHERE snoozed_until > now() AND NOT is_archived)
  );
$$;

REVOKE ALL ON FUNCTION public.sidebar_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sidebar_counts() TO authenticated;

-- ─── SYNC-5: cron-naam klopt met het schema (elke 15 min) ───
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inbox-sync-every-minute') THEN
    PERFORM cron.unschedule('inbox-sync-every-minute');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inbox-sync-every-15-min') THEN
    PERFORM cron.schedule(
      'inbox-sync-every-15-min',
      '*/15 * * * *',
      $cmd$ SELECT public.trigger_inbox_sync_for_all_accounts(); $cmd$
    );
  END IF;
END;
$$;

-- ─── SYNC-6: pg_net wacht 30 s i.p.v. 5 s op sync-inbox ───
-- Identiek aan 20260918091301, alleen timeout_milliseconds toegevoegd.
CREATE OR REPLACE FUNCTION public.trigger_inbox_sync_for_all_accounts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'private'
AS $function$
DECLARE
  acc RECORD;
  fresh_run_id uuid;
  v_secret text;
BEGIN
  SELECT value INTO v_secret FROM private.config WHERE key = 'sync_cron_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING 'trigger_inbox_sync_for_all_accounts: sync_cron_secret not configured, skipping';
    RETURN;
  END IF;

  FOR acc IN
    SELECT id
    FROM public.email_accounts
    WHERE vault_secret_id IS NOT NULL
      AND sync_enabled = true
  LOOP
    SELECT id INTO fresh_run_id
    FROM public.sync_log
    WHERE email_account_id = acc.id
      AND status = 'running'
      AND last_heartbeat_at IS NOT NULL
      AND last_heartbeat_at > now() - interval '60 seconds'
    LIMIT 1;

    IF fresh_run_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url := 'https://tvynbrtmohuciybwwzzl.supabase.co/functions/v1/sync-inbox',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_secret
      ),
      body := jsonb_build_object('account_id', acc.id::text),
      timeout_milliseconds := 30000
    );
  END LOOP;
END;
$function$;
