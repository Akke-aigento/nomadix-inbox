import { supabase } from "@/integrations/supabase/client";

const HEARTBEAT_FRESH_MS = 60_000;

export type SyncGuardResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Ensure there is no actively running sync for the given account before
 * triggering a new `sync-inbox` invocation.
 *
 * - Fresh heartbeat (< 60s)  → block, returns { ok: false, reason }.
 * - Stale heartbeat (≥ 60s)  → mark old row as error, returns { ok: true }.
 * - No running row           → returns { ok: true }.
 */
export async function ensureNoActiveSync(
  accountId: string,
): Promise<SyncGuardResult> {
  const { data: activeRun, error } = await supabase
    .from("sync_log")
    .select("id, started_at, last_heartbeat_at")
    .eq("email_account_id", accountId)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: error.message };
  }
  if (!activeRun) return { ok: true };

  const hb = activeRun.last_heartbeat_at
    ? new Date(activeRun.last_heartbeat_at).getTime()
    : 0;
  const heartbeatAge = Date.now() - hb;

  if (hb > 0 && heartbeatAge < HEARTBEAT_FRESH_MS) {
    return { ok: false, reason: "Sync al bezig — wacht tot deze klaar is" };
  }

  // Stale row → mark as error so we can start a fresh run.
  await supabase
    .from("sync_log")
    .update({
      status: "error",
      finished_at: new Date().toISOString(),
      error_message: "Stale run cleared on retry",
    })
    .eq("id", activeRun.id);

  return { ok: true };
}
