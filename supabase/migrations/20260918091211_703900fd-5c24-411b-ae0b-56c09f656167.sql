CREATE OR REPLACE FUNCTION public.check_sync_cron_secret(p_secret text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public
AS $$ SELECT p_secret IS NOT NULL AND length(p_secret) > 0 AND p_secret = (SELECT value FROM private.config WHERE key = 'sync_cron_secret') $$;

REVOKE ALL ON FUNCTION public.check_sync_cron_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_sync_cron_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.check_sync_cron_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_sync_cron_secret(text) TO service_role;