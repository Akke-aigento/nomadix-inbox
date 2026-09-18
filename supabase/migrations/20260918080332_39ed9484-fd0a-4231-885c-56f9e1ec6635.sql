ALTER TABLE public.email_accounts ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.trigger_inbox_sync_for_all_accounts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  acc RECORD;
  fresh_run_id uuid;
BEGIN
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
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2eW5icnRtb2h1Y2l5Ynd3enpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njg0NTkyNSwiZXhwIjoyMDkyNDIxOTI1fQ.QqZdgebjLyRT2Piy3DhsKGh4mJSAkVXUMpdf54dtU78',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2eW5icnRtb2h1Y2l5Ynd3enpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njg0NTkyNSwiZXhwIjoyMDkyNDIxOTI1fQ.QqZdgebjLyRT2Piy3DhsKGh4mJSAkVXUMpdf54dtU78'
      ),
      body := jsonb_build_object('account_id', acc.id::text)
    );
  END LOOP;
END;
$function$;