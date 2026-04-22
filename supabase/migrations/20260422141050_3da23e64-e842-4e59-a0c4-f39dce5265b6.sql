-- Full-text search index on messages
CREATE INDEX IF NOT EXISTS messages_fts_idx ON public.messages 
USING GIN (to_tsvector('simple', 
  coalesce(subject,'') || ' ' || 
  coalesce(body_text,'') || ' ' || 
  coalesce(from_address,'')
));

-- Helpful indexes for inbox queries
CREATE INDEX IF NOT EXISTS threads_owner_archived_last_msg_idx 
  ON public.threads (owner_user_id, is_archived, last_message_at DESC);

CREATE INDEX IF NOT EXISTS threads_owner_brand_idx 
  ON public.threads (owner_user_id, brand_id);

CREATE INDEX IF NOT EXISTS messages_thread_received_idx 
  ON public.messages (thread_id, received_at);

-- Enable realtime
ALTER TABLE public.threads REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;