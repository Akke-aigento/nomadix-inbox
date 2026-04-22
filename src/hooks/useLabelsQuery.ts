import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LabelRow {
  id: string;
  name: string;
  color: string;
}

export function useLabelsQuery() {
  return useQuery({
    queryKey: ["labels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("labels")
        .select("id, name, color")
        .order("name");
      if (error) throw error;
      return (data || []) as LabelRow[];
    },
  });
}

export function useThreadLabels(threadIds: string[]) {
  return useQuery({
    queryKey: ["thread-labels", [...threadIds].sort().join(",")],
    enabled: threadIds.length > 0,
    queryFn: async () => {
      if (!threadIds.length) return {};
      const { data } = await supabase
        .from("thread_labels")
        .select("thread_id, label_id")
        .in("thread_id", threadIds);
      const out: Record<string, string[]> = {};
      for (const row of data || []) {
        const tid = row.thread_id as string;
        if (!out[tid]) out[tid] = [];
        out[tid].push(row.label_id as string);
      }
      return out;
    },
  });
}

/** Tick once a minute so snoozed-thread queries auto-refresh as items wake up. */
export function useSnoozeWakeupTick() {
  const qc = useQueryClient();
  useEffect(() => {
    const id = window.setInterval(() => {
      qc.invalidateQueries({ queryKey: ["threads"] });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [qc]);
}
