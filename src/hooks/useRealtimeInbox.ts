import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeInbox() {
  const qc = useQueryClient();
  useEffect(() => {
    // Only `threads` is in the realtime publication; every message change
    // updates its thread row via trigger. Debounce bursts (e.g. during sync).
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        qc.invalidateQueries({ queryKey: ["threads"] });
        qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
        // Refetches the open thread's messages (only active queries refetch).
        qc.invalidateQueries({ queryKey: ["thread"] });
      }, 1000);
    };
    const channel = supabase
      .channel("inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "threads" }, reload)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

export function useThreadDetailQuery(threadId: string | null) {
  // tiny re-export-friendly wrapper handled inline elsewhere
  return threadId;
}
