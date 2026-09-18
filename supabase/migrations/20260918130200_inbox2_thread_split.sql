-- INBOX-2 (C) — foutief samengevoegde threads splitsen.
--
-- De oude onderwerp-fallback in findOrCreateThread plakte losse meldingen met
-- hetzelfde onderwerp aan elkaar (bv. verschillende bpost-pakjes). Een thread
-- is "foutief samengevoegd" als hij >1 bericht heeft en GEEN enkel bericht
-- een antwoord-relatie heeft: geen In-Reply-To, geen References, geen
-- Re:/Aw:/Antw:/Fw:/Fwd:/Tr:/Wg:-onderwerp, niet uitgaand.
-- Stand 18-09: 29 threads, 112 berichten → 83 nieuwe threads; threads met
-- >1 bericht gaan van 38 naar 9.
--
-- Aanpak: het oudste bericht blijft in de bestaande thread, elk ander bericht
-- krijgt een eigen thread (erft archief/mute/snooze + labels van de oude).
-- Idempotent: snapshot met vaste new_thread_id per bericht (ON CONFLICT DO
-- NOTHING); na de split kwalificeert geen van deze threads nog. Een herhaalde
-- run na een halve run hergebruikt dezelfde ids. Geen now(): tijdstempels
-- komen van het bericht. unread_count volgt via trigger messages_unread_sync.
-- Draai NA migratie B (nieuwe threads nemen het merk van het bericht over).

BEGIN;

CREATE TABLE IF NOT EXISTS snapshots.inbox2_split (
  message_id    uuid PRIMARY KEY,
  old_thread_id uuid NOT NULL,
  new_thread_id uuid NOT NULL UNIQUE
);
REVOKE ALL ON TABLE snapshots.inbox2_split FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS snapshots.inbox2_split_threads (
  LIKE public.threads INCLUDING DEFAULTS,
  PRIMARY KEY (id)
);
REVOKE ALL ON TABLE snapshots.inbox2_split_threads FROM PUBLIC, anon, authenticated;

-- 1. Welke threads, welke berichten verhuizen (alles behalve het oudste).
WITH rel AS (
  SELECT m.thread_id,
         bool_or(
           m.in_reply_to IS NOT NULL
           OR m.raw_headers ? 'references'
           OR m.raw_headers ? 'References'
           OR coalesce(m.subject, '') ~* '^\s*(re|aw|antw|fw|fwd|tr|wg)\s*:'
           OR m.is_outbound
         ) AS related,
         count(*) AS n
    FROM public.messages m
   WHERE m.thread_id IS NOT NULL
   GROUP BY m.thread_id
),
target AS (
  SELECT thread_id FROM rel WHERE n > 1 AND NOT related
),
ordered AS (
  SELECT m.id, m.thread_id,
         row_number() OVER (PARTITION BY m.thread_id ORDER BY m.received_at, m.id) AS rn
    FROM public.messages m
    JOIN target t ON t.thread_id = m.thread_id
)
INSERT INTO snapshots.inbox2_split (message_id, old_thread_id, new_thread_id)
SELECT o.id, o.thread_id, gen_random_uuid()
  FROM ordered o
 WHERE o.rn > 1
ON CONFLICT (message_id) DO NOTHING;

-- 2. Oude thread-rijen bewaren (vóór elke wijziging).
INSERT INTO snapshots.inbox2_split_threads
SELECT t.*
  FROM public.threads t
 WHERE t.id IN (SELECT DISTINCT old_thread_id FROM snapshots.inbox2_split)
ON CONFLICT (id) DO NOTHING;

-- 3. Nieuwe threads aanmaken (één per verhuizend bericht).
INSERT INTO public.threads (
  id, owner_user_id, brand_id, subject, preview, message_count, unread_count,
  has_attachments, is_starred, is_archived, is_muted, snoozed_until,
  last_message_at, participants, created_at, updated_at
)
SELECT s.new_thread_id,
       ot.owner_user_id,
       coalesce(m.brand_id, ot.brand_id),
       m.subject,
       left(coalesce(m.body_text, ''), 200),
       1,
       CASE WHEN m.is_read THEN 0 ELSE 1 END,
       false,  -- has_attachments: wordt nergens gezet (backlog); hier niet afwijken
       false,
       ot.is_archived,
       ot.is_muted,
       ot.snoozed_until,
       m.received_at,
       jsonb_build_array(m.from_address),
       m.received_at,
       m.received_at
  FROM snapshots.inbox2_split s
  JOIN public.messages m ON m.id = s.message_id
  JOIN snapshots.inbox2_split_threads ot ON ot.id = s.old_thread_id
 WHERE NOT EXISTS (SELECT 1 FROM public.threads x WHERE x.id = s.new_thread_id);

-- 4. Labels van de oude thread meenemen.
INSERT INTO public.thread_labels (thread_id, label_id, owner_user_id)
SELECT s.new_thread_id, tl.label_id, tl.owner_user_id
  FROM snapshots.inbox2_split s
  JOIN public.thread_labels tl ON tl.thread_id = s.old_thread_id
ON CONFLICT DO NOTHING;

-- 5. Berichten verhuizen (alleen wie nog in de oude thread zit).
UPDATE public.messages m
   SET thread_id = s.new_thread_id
  FROM snapshots.inbox2_split s
 WHERE m.id = s.message_id
   AND m.thread_id = s.old_thread_id;

-- 6. Oude threads herberekenen (tellers, laatste bericht, deelnemers, preview, onderwerp).
UPDATE public.threads t
   SET message_count   = st.n,
       last_message_at = st.last_at,
       participants    = st.participants,
       preview         = st.preview,
       subject         = st.subject
  FROM (
    SELECT m.thread_id,
           count(*) AS n,
           max(m.received_at) AS last_at,
           to_jsonb(array_agg(DISTINCT m.from_address)) AS participants,
           (array_agg(left(coalesce(m.body_text, ''), 200) ORDER BY m.received_at DESC))[1] AS preview,
           (array_agg(m.subject ORDER BY m.received_at))[1] AS subject
      FROM public.messages m
     WHERE m.thread_id IN (SELECT DISTINCT old_thread_id FROM snapshots.inbox2_split)
     GROUP BY m.thread_id
  ) st
 WHERE t.id = st.thread_id;

COMMIT;

-- ─── Verificatie ───
-- SELECT count(*) FROM snapshots.inbox2_split;                                  -- verwacht 83
-- SELECT count(DISTINCT old_thread_id) FROM snapshots.inbox2_split;            -- verwacht 29
-- SELECT count(*) FROM (SELECT thread_id FROM public.messages
--                        GROUP BY 1 HAVING count(*) > 1) x;                     -- verwacht 9
-- SELECT count(*) FROM public.threads;                                          -- verwacht 1023 + 83 = 1106
-- SELECT count(*) FROM public.threads t
--  WHERE t.message_count <> (SELECT count(*) FROM public.messages m WHERE m.thread_id = t.id);  -- verwacht 0
--   (was 1 vóór de migratie; staat die er nog, dan is het niet een van de gesplitste)
-- SELECT count(*) FROM public.threads t WHERE unread_count <>
--   (SELECT count(*) FROM public.messages m WHERE m.thread_id = t.id AND NOT m.is_read);          -- verwacht 0

-- ─── Rollback (berichten terug, nieuwe threads weg, oude rijen hersteld) ───
-- BEGIN;
-- UPDATE public.messages m
--    SET thread_id = s.old_thread_id
--   FROM snapshots.inbox2_split s
--  WHERE m.id = s.message_id
--    AND m.thread_id = s.new_thread_id;
-- DELETE FROM public.thread_labels
--  WHERE thread_id IN (SELECT new_thread_id FROM snapshots.inbox2_split);
-- DELETE FROM public.threads t
--  WHERE t.id IN (SELECT new_thread_id FROM snapshots.inbox2_split)
--    AND NOT EXISTS (SELECT 1 FROM public.messages m WHERE m.thread_id = t.id);  -- sindsdien binnengekomen mail blijft staan
-- UPDATE public.threads t
--    SET brand_id = st.brand_id, subject = st.subject, preview = st.preview,
--        message_count = st.message_count,   -- unread_count: volgt via trigger bij het terugzetten
--        has_attachments = st.has_attachments, is_starred = st.is_starred,
--        is_archived = st.is_archived, is_muted = st.is_muted,
--        snoozed_until = st.snoozed_until, last_message_at = st.last_message_at,
--        participants = st.participants
--   FROM snapshots.inbox2_split_threads st
--  WHERE t.id = st.id;
-- COMMIT;
