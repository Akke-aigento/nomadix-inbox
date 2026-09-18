-- INBOX-2 (A) — threadlijst server-side. Idempotent (CREATE OR REPLACE).
--
-- Vervangt in de frontend: threads .limit(500) + een tweede messages-fetch
-- (.in(thread_id), afgekapt op PostgREST's 1000 rijen) + client-side filters
-- die pas ná de limit draaiden. Alles gebeurt nu in één query, vóór de limit.
-- Semantiek identiek aan src/hooks/useThreadsQuery.ts (INBOX-1b), met twee
-- uitbreidingen: categorie-filter werkt (was een no-op) en sortering gebeurt
-- vóór de limit (was: sorteren binnen de 500 nieuwste).
-- SECURITY INVOKER: RLS op threads/messages blijft de eigenaar afbakenen.

CREATE OR REPLACE FUNCTION public.thread_list(
  p_view            text    DEFAULT 'inbox',
  p_brand_ids       uuid[]  DEFAULT NULL,
  p_state           text    DEFAULT 'all',
  p_has_attachments boolean DEFAULT false,
  p_since           timestamptz DEFAULT NULL,
  p_urgency         text    DEFAULT 'any',
  p_from            text    DEFAULT NULL,
  p_sent_to         text    DEFAULT NULL,
  p_label_ids       uuid[]  DEFAULT NULL,
  p_category_ids    uuid[]  DEFAULT NULL,
  p_search          text    DEFAULT NULL,
  p_sort            text    DEFAULT 'newest',
  p_limit           integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_view   text := coalesce(nullif(p_view, ''), 'inbox');
  v_state  text := coalesce(nullif(p_state, ''), 'all');
  v_sort   text := coalesce(nullif(p_sort, ''), 'newest');
  -- LIKE-patronen: % en _ in gebruikersinvoer letterlijk nemen.
  v_from   text := nullif(lower(trim(coalesce(p_from, ''))), '');
  v_to     text := nullif(lower(trim(coalesce(p_sent_to, ''))), '');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_from_like   text;
  v_to_like     text;
  v_search_like text;
  v_now    timestamptz := now();
  v_labels uuid[] := CASE WHEN cardinality(p_label_ids) > 0 THEN p_label_ids END;
  v_cats   uuid[] := CASE WHEN cardinality(p_category_ids) > 0 THEN p_category_ids END;
  v_brands uuid[] := CASE WHEN cardinality(p_brand_ids) > 0 THEN p_brand_ids END;
  v_label_n integer;
BEGIN
  v_from_like := '%' || replace(replace(replace(v_from, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_to_like   := '%' || replace(replace(replace(v_to, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_search_like := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  SELECT count(DISTINCT x) INTO v_label_n FROM unnest(v_labels) AS x;

  RETURN (
    WITH base AS (
      SELECT t.*,
             lm.obj          AS lm_obj,
             lm.needs_reply  AS lm_needs_reply,
             lm.urgency      AS lm_urgency,
             lm.from_address AS lm_from,
             lm.matched      AS lm_matched
        FROM public.threads t
        LEFT JOIN LATERAL (
          SELECT jsonb_build_object(
                   'from_address', m.from_address,
                   'from_name', m.from_name,
                   'subject', m.subject,
                   'body_text', left(m.body_text, 200),
                   'urgency', m.urgency,
                   'needs_reply', m.needs_reply,
                   'matched_email_address', m.matched_email_address,
                   'received_at', m.received_at,
                   'ai_category', m.ai_category
                 ) AS obj,
                 m.needs_reply, m.urgency, m.from_address,
                 m.matched_email_address AS matched
            FROM public.messages m
           WHERE m.thread_id = t.id
           ORDER BY m.received_at DESC
           LIMIT 1
        ) lm ON true
       WHERE
         -- view
         CASE v_view
           WHEN 'inbox' THEN NOT t.is_archived AND NOT t.is_muted
                             AND (t.snoozed_until IS NULL OR t.snoozed_until <= v_now)
           WHEN 'needs-reply' THEN NOT t.is_archived AND NOT t.is_muted
                             AND (t.snoozed_until IS NULL OR t.snoozed_until <= v_now)
           WHEN 'archive' THEN t.is_archived
           WHEN 'snoozed' THEN t.snoozed_until > v_now AND NOT t.is_archived
           WHEN 'muted'   THEN t.is_muted AND NOT t.is_archived
           WHEN 'sent'    THEN EXISTS (SELECT 1 FROM public.messages s
                                        WHERE s.thread_id = t.id AND s.is_outbound)
           WHEN 'drafts'  THEN EXISTS (SELECT 1 FROM public.drafts d
                                         JOIN public.messages dm ON dm.id = d.in_reply_to_message_id
                                        WHERE dm.thread_id = t.id)
           ELSE true  -- 'all': alles, ook archief en muted
         END
         AND (v_brands IS NULL OR t.brand_id = ANY (v_brands))
         AND (v_state <> 'unread'   OR t.unread_count > 0)
         AND (v_state <> 'read'     OR t.unread_count = 0)
         AND (v_state <> 'archived' OR t.is_archived)
         AND (NOT coalesce(p_has_attachments, false) OR t.has_attachments)
         AND (p_since IS NULL OR t.last_message_at >= p_since)
    ),
    filtered AS (
      SELECT b.*
        FROM base b
       WHERE ((v_view <> 'needs-reply' AND v_state <> 'needs-reply') OR b.lm_needs_reply IS TRUE)
         AND (coalesce(p_urgency, 'any') <> 'high' OR b.lm_urgency IN ('high', 'urgent'))
         AND (v_from IS NULL OR lower(b.lm_from) LIKE v_from_like ESCAPE '\')
         AND (v_to IS NULL OR lower(b.lm_matched) LIKE v_to_like ESCAPE '\')
         -- labels: de thread heeft ze állemaal
         AND (v_labels IS NULL OR (
               SELECT count(DISTINCT tl.label_id) FROM public.thread_labels tl
                WHERE tl.thread_id = b.id AND tl.label_id = ANY (v_labels)
             ) = v_label_n)
         -- categorieën: minstens één bericht van de thread heeft er één van
         AND (v_cats IS NULL OR EXISTS (
               SELECT 1 FROM public.message_categories mc
                 JOIN public.messages cm ON cm.id = mc.message_id
                WHERE cm.thread_id = b.id AND mc.category_id = ANY (v_cats)))
         -- zoeken: onderwerp (websearch) of body (substring), over alle berichten
         AND (v_search IS NULL OR EXISTS (
               SELECT 1 FROM public.messages sm
                WHERE sm.thread_id = b.id
                  AND (to_tsvector('simple', coalesce(sm.subject, ''))
                         @@ websearch_to_tsquery('simple', v_search)
                       OR sm.body_text ILIKE v_search_like ESCAPE '\')))
    ),
    ranked AS (
      SELECT f.*,
             row_number() OVER (
               ORDER BY
                 CASE WHEN v_sort = 'unread' THEN (f.unread_count > 0)::int END DESC NULLS LAST,
                 CASE WHEN v_sort = 'most-replies' THEN f.message_count END DESC NULLS LAST,
                 CASE WHEN v_sort = 'oldest' THEN f.last_message_at END ASC NULLS LAST,
                 f.last_message_at DESC NULLS LAST,
                 f.id
             ) AS rn
        FROM filtered f
    )
    SELECT coalesce(jsonb_agg(
             jsonb_build_object(
               'id', r.id,
               'subject', r.subject,
               'preview', r.preview,
               'last_message_at', r.last_message_at,
               'is_archived', r.is_archived,
               'is_starred', r.is_starred,
               'is_muted', r.is_muted,
               'snoozed_until', r.snoozed_until,
               'has_attachments', r.has_attachments,
               'unread_count', r.unread_count,
               'message_count', r.message_count,
               'brand_id', r.brand_id,
               'participants', r.participants,
               'brand', (SELECT jsonb_build_object('id', br.id, 'name', br.name,
                                                   'slug', br.slug, 'color_primary', br.color_primary)
                           FROM public.brands br WHERE br.id = r.brand_id),
               'latest_message', r.lm_obj
             ) ORDER BY r.rn), '[]'::jsonb)
      FROM ranked r
     WHERE r.rn <= greatest(coalesce(p_limit, 500), 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.thread_list(text, uuid[], text, boolean, timestamptz, text, text, text, uuid[], uuid[], text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.thread_list(text, uuid[], text, boolean, timestamptz, text, text, text, uuid[], uuid[], text, text, integer) TO authenticated;

-- ─── Verificatie (na uitvoeren) ───
-- SELECT jsonb_array_length(public.thread_list());                       -- als service_role: alle eigenaars; via de app: alleen eigen
-- SELECT jsonb_array_length(public.thread_list(p_view => 'all'));        -- ≈ 1023 (vóór split) / ≈ 1106 (na split, migratie C)
-- SELECT public.thread_list(p_view => 'sent') ->0 ->> 'subject';         -- een thread met een uitgaand bericht
-- SELECT (public.thread_list(p_sort => 'oldest', p_view => 'all') ->0 ->> 'last_message_at');  -- de oudste
-- has_function_privilege('anon', 'public.thread_list(text, uuid[], text, boolean, timestamptz, text, text, text, uuid[], uuid[], text, text, integer)', 'EXECUTE') = false
