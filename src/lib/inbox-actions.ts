import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

export async function archiveThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  // Optimistic: snapshot + remove from inbox lists immediately
  await qc.cancelQueries({ queryKey: ["threads"] });
  await supabase.from("threads").update({ is_archived: true }).in("id", threadIds);
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function unarchiveThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  await supabase.from("threads").update({ is_archived: false }).in("id", threadIds);
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function deleteThreads(threadIds: string[], qc: QueryClient) {
  if (!threadIds.length) return;
  // Soft-delete by archiving for now. Real delete = remove messages (cascade) + threads.
  await supabase.from("messages").delete().in("thread_id", threadIds);
  await supabase.from("threads").delete().in("id", threadIds);
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function setThreadsRead(threadIds: string[], read: boolean, qc: QueryClient) {
  if (!threadIds.length) return;
  await supabase.from("messages").update({ is_read: read }).in("thread_id", threadIds);
  // Also bump unread_count cache directly
  await supabase
    .from("threads")
    .update({ unread_count: read ? 0 : 1 })
    .in("id", threadIds);
  qc.invalidateQueries({ queryKey: ["threads"] });
  qc.invalidateQueries({ queryKey: ["thread", threadIds[0]] });
  qc.invalidateQueries({ queryKey: ["sidebar-counts"] });
}

export async function toggleStar(threadId: string, starred: boolean, qc: QueryClient) {
  await supabase.from("threads").update({ is_starred: starred }).eq("id", threadId);
  qc.invalidateQueries({ queryKey: ["threads"] });
}
