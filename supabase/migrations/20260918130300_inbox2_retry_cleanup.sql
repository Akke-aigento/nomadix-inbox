-- INBOX-2 (D) — retry-rijen opruimen waarvan het bericht al binnen is.
-- De late retry (INBOX-1a) ruimt zulke rijen op, maar alleen als attempts < 10;
-- 654 (13) en 721 (16) vallen daarbuiten. Hier: alle rijen waarvan het bericht
-- (zelfde account + UID) al in messages staat, ongeacht attempts.
-- Stand 18-09: 7 rijen (654, 721, 762, 796, 948, 1045, 1076); 752 en 753
-- blijven staan (nog niet binnen — de late retry probeert ze verder).
-- Idempotent, snapshot eerst, geen now().

BEGIN;

CREATE TABLE IF NOT EXISTS snapshots.inbox2_retries (
  LIKE public.sync_uid_retries INCLUDING DEFAULTS,
  PRIMARY KEY (id)
);
REVOKE ALL ON TABLE snapshots.inbox2_retries FROM PUBLIC, anon, authenticated;

INSERT INTO snapshots.inbox2_retries
SELECT r.*
  FROM public.sync_uid_retries r
 WHERE EXISTS (SELECT 1 FROM public.messages m
                WHERE m.email_account_id = r.email_account_id
                  AND m.imap_uid = r.uid)
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.sync_uid_retries r
 USING snapshots.inbox2_retries s
 WHERE r.id = s.id;

COMMIT;

-- ─── Verificatie ───
-- SELECT count(*) FROM snapshots.inbox2_retries;                           -- verwacht 7
-- SELECT uid, attempts, gave_up FROM public.sync_uid_retries ORDER BY uid;  -- verwacht alleen 752, 753
-- SELECT count(*) FROM public.sync_uid_retries r WHERE EXISTS (
--   SELECT 1 FROM public.messages m WHERE m.email_account_id = r.email_account_id AND m.imap_uid = r.uid);  -- verwacht 0

-- ─── Rollback ───
-- INSERT INTO public.sync_uid_retries
-- SELECT s.* FROM snapshots.inbox2_retries s
-- ON CONFLICT (id) DO NOTHING;
