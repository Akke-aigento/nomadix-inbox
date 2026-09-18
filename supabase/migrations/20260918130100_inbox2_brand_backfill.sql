-- INBOX-2 (B) — merk-her-detectie voor berichten/threads zonder merk.
-- Eenmalig, idempotent: raakt alleen rijen met brand_id IS NULL; snapshot eerst.
-- Zelfde tiers als supabase/functions/_shared/detect-brand.ts:
--   1 To exact (1.0, header_to) · 2 Cc exact (0.85, header_cc)
--   3 forwarded headers exact (0.9, header_forwarded)
--   4 catch-all-domein op To, dan forwarded (0.92, header_catch_all)
-- Verwacht (18-09): 107 berichten zonder merk → 106 via tier 4; 1 blijft leeg
-- (Bcc-bericht zonder To/Delivered-To, niet te bepalen). Geen now().

BEGIN;

CREATE TABLE IF NOT EXISTS snapshots.inbox2_brand (
  kind                     text NOT NULL CHECK (kind IN ('message', 'thread')),
  id                       uuid NOT NULL,
  old_brand_id             uuid,
  old_detected_via         text,
  old_detection_confidence numeric,
  old_matched_email_address text,
  PRIMARY KEY (kind, id)
);
REVOKE ALL ON TABLE snapshots.inbox2_brand FROM PUBLIC, anon, authenticated;

INSERT INTO snapshots.inbox2_brand (kind, id, old_brand_id, old_detected_via,
                                    old_detection_confidence, old_matched_email_address)
SELECT 'message', m.id, m.brand_id, m.detected_via, m.detection_confidence, m.matched_email_address
  FROM public.messages m
 WHERE m.brand_id IS NULL AND NOT m.is_outbound
ON CONFLICT DO NOTHING;

INSERT INTO snapshots.inbox2_brand (kind, id, old_brand_id)
SELECT 'thread', t.id, t.brand_id
  FROM public.threads t
 WHERE t.brand_id IS NULL
ON CONFLICT DO NOTHING;

WITH cand AS (
  SELECT m.id, m.owner_user_id, m.to_addresses, m.cc_addresses, m.raw_headers
    FROM public.messages m
   WHERE m.brand_id IS NULL AND NOT m.is_outbound
),
addrs AS (
  SELECT c.id, c.owner_user_id, 'to' AS src, a.o AS pos, lower(trim(a.x->>'address')) AS addr
    FROM cand c,
         jsonb_array_elements(CASE WHEN jsonb_typeof(c.to_addresses) = 'array'
                                   THEN c.to_addresses ELSE '[]'::jsonb END) WITH ORDINALITY AS a(x, o)
  UNION ALL
  SELECT c.id, c.owner_user_id, 'cc', a.o, lower(trim(a.x->>'address'))
    FROM cand c,
         jsonb_array_elements(CASE WHEN jsonb_typeof(c.cc_addresses) = 'array'
                                   THEN c.cc_addresses ELSE '[]'::jsonb END) WITH ORDINALITY AS a(x, o)
  UNION ALL
  SELECT c.id, c.owner_user_id, 'fwd', h.o * 100 + r.o, lower(r.v[1])
    FROM cand c,
         unnest(ARRAY['x-forwarded-to', 'delivered-to', 'x-original-to', 'x-forwarded-for'])
           WITH ORDINALITY AS h(k, o),
         regexp_matches(coalesce(c.raw_headers->>h.k, ''), '([^\s<>,;"]+@[^\s<>,;"]+)', 'g')
           WITH ORDINALITY AS r(v, o)
),
hits AS (
  SELECT a.id, b.brand_id, a.addr,
         CASE a.src WHEN 'to' THEN 1 WHEN 'cc' THEN 2 ELSE 3 END AS tier, a.pos
    FROM addrs a
    JOIN public.brand_email_addresses b
      ON b.owner_user_id = a.owner_user_id
     AND NOT b.is_catch_all
     AND lower(b.email_address) = a.addr
  UNION ALL
  SELECT a.id, b.brand_id, a.addr, 4,
         CASE a.src WHEN 'to' THEN a.pos ELSE 1000 + a.pos END
    FROM addrs a
    JOIN public.brand_email_addresses b
      ON b.owner_user_id = a.owner_user_id
     AND b.is_catch_all
     AND lower(b.catch_all_domain) = split_part(a.addr, '@', 2)
   WHERE a.src IN ('to', 'fwd')
),
best AS (
  SELECT DISTINCT ON (id) id, brand_id, addr, tier
    FROM hits
   ORDER BY id, tier, pos
)
UPDATE public.messages m
   SET brand_id = b.brand_id,
       matched_email_address = b.addr,
       detected_via = CASE b.tier WHEN 1 THEN 'header_to' WHEN 2 THEN 'header_cc'
                                  WHEN 3 THEN 'header_forwarded' ELSE 'header_catch_all' END,
       detection_confidence = CASE b.tier WHEN 1 THEN 1.0 WHEN 2 THEN 0.85
                                          WHEN 3 THEN 0.9 ELSE 0.92 END
  FROM best b
 WHERE m.id = b.id
   AND m.brand_id IS NULL;

-- Thread zonder merk → merk van het oudste inkomende bericht mét merk.
UPDATE public.threads t
   SET brand_id = s.brand_id
  FROM (
    SELECT DISTINCT ON (m.thread_id) m.thread_id, m.brand_id
      FROM public.messages m
     WHERE m.brand_id IS NOT NULL AND NOT m.is_outbound AND m.thread_id IS NOT NULL
     ORDER BY m.thread_id, m.received_at, m.id
  ) s
 WHERE t.id = s.thread_id
   AND t.brand_id IS NULL;

COMMIT;

-- ─── Verificatie ───
-- SELECT count(*) FROM public.messages WHERE brand_id IS NULL AND NOT is_outbound;   -- verwacht 1
-- SELECT count(*) FROM public.threads  WHERE brand_id IS NULL;                        -- verwacht 1
-- SELECT m.detected_via, count(*) FROM public.messages m
--   JOIN snapshots.inbox2_brand s ON s.kind = 'message' AND s.id = m.id GROUP BY 1;  -- header_catch_all 106, unknown 1
-- SELECT b.slug, count(*) FROM public.messages m JOIN public.brands b ON b.id = m.brand_id
--   JOIN snapshots.inbox2_brand s ON s.kind = 'message' AND s.id = m.id GROUP BY 1 ORDER BY 2 DESC;

-- ─── Rollback (alleen bij nood; draai C-rollback eerst als C al gedraaid is) ───
-- BEGIN;
-- UPDATE public.messages m
--    SET brand_id = s.old_brand_id,
--        detected_via = s.old_detected_via,
--        detection_confidence = s.old_detection_confidence,
--        matched_email_address = s.old_matched_email_address
--   FROM snapshots.inbox2_brand s
--  WHERE s.kind = 'message' AND m.id = s.id;
-- UPDATE public.threads t
--    SET brand_id = s.old_brand_id
--   FROM snapshots.inbox2_brand s
--  WHERE s.kind = 'thread' AND t.id = s.id;
-- COMMIT;
