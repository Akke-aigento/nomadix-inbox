CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS private.config (
  key text PRIMARY KEY,
  value text NOT NULL
);

REVOKE ALL ON TABLE private.config FROM anon, authenticated;
GRANT ALL ON TABLE private.config TO service_role;

ALTER TABLE private.config ENABLE ROW LEVEL SECURITY;

INSERT INTO private.config (key, value)
VALUES ('health_token', 'CHANGE_ME')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_health_token()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT value FROM private.config WHERE key = 'health_token'
$$;

REVOKE ALL ON FUNCTION public.get_health_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_health_token() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_health_token() TO service_role;