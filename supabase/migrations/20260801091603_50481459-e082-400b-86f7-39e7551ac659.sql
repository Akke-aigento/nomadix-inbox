CREATE TABLE public.sync_uid_retries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id uuid NOT NULL REFERENCES public.email_accounts(id) ON DELETE CASCADE,
  uid bigint NOT NULL,
  attempts int NOT NULL DEFAULT 1,
  last_error text,
  gave_up boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (email_account_id, uid)
);

GRANT SELECT ON public.sync_uid_retries TO authenticated;
GRANT ALL ON public.sync_uid_retries TO service_role;

ALTER TABLE public.sync_uid_retries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their own sync uid retries"
ON public.sync_uid_retries FOR SELECT TO authenticated
USING (auth.uid() = owner_user_id);

CREATE TRIGGER set_sync_uid_retries_updated_at
BEFORE UPDATE ON public.sync_uid_retries
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();