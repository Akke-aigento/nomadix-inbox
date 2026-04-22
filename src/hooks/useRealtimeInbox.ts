import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeInbox() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "threads" },
        () => {
          qc.invalidateQueries({ queryKey: ["threads"] });
          qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["threads"] });
          qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
          const tid = (payload.new as any)?.thread_id;
          if (tid) qc.invalidateQueries({ queryKey: ["thread", tid] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

export function useThreadDetailQuery(threadId: string | null) {
  // tiny re-export-friendly wrapper handled inline elsewhere
  return threadId;
}
