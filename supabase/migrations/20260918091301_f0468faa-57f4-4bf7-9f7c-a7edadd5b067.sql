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
      body := jsonb_build_object('account_id', acc.id::text)
    );
  END LOOP;
END;
$function$;