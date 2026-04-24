// Pull new messages from Migadu via IMAP, parse, classify, persist.
// Foreground batched sync with heartbeat. Returns when batch finishes
// (or hits max time) — UI re-invokes if batch_complete=false.

import { ImapFlow } from "npm:imapflow@1.0.171";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";
import { processMessage } from "../_shared/process-message.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// How long a single invocation will keep processing before yielding
// the batch back to the UI. Edge functions have a hard ~150s wall clock,
// so we stay well under it.
const MAX_BATCH_MS = 90_000;
// Hard cap on messages processed per batch invocation (safety).
const MAX_BATCH_MESSAGES = 50;
// How often we update last_heartbeat_at while running.
const HEARTBEAT_INTERVAL_MS = 5_000;
// A run is "stale" if its heartbeat is older than this when a new sync starts.
const STALE_HEARTBEAT_MS = 60_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampError(s: string | undefined | null, max = 500) {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const { account_id } = await req.json().catch(() => ({}));
    if (!account_id || typeof account_id !== "string") {
      return json({ error: "account_id required" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller owns this account (using their JWT)
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: account, error: accErr } = await supabase
      .from("email_accounts")
      .select("*")
      .eq("id", account_id)
      .single();
    if (accErr || !account) return json({ error: "Account not found" }, 404);
    if (account.owner_user_id !== userRes.user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    // ─── Reap stale "running" rows based on heartbeat ───
    const staleCutoff = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
    await supabase
      .from("sync_log")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        batch_complete: true,
        error_message: "Auto-closed: heartbeat stalled",
      })
      .eq("email_account_id", account_id)
      .eq("status", "running")
      .or(`last_heartbeat_at.lt.${staleCutoff},last_heartbeat_at.is.null`)
      .lt("started_at", staleCutoff);

    // ─── Determine resume point ───
    // Prefer next_uid from a recent partial run; otherwise use highest_uid_seen
    // from the last successful run.
    let lastUid = 0;
    const { data: lastPartial } = await supabase
      .from("sync_log")
      .select("next_uid, highest_uid_seen")
      .eq("email_account_id", account_id)
      .eq("status", "partial")
      .not("next_uid", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastPartial?.next_uid) {
      lastUid = Number(lastPartial.next_uid) - 1;
    } else {
      const { data: lastOk } = await supabase
        .from("sync_log")
        .select("highest_uid_seen")
        .eq("email_account_id", account_id)
        .eq("status", "ok")
        .not("highest_uid_seen", "is", null)
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastUid = Number(lastOk?.highest_uid_seen ?? 0);
    }

    // ─── Open new sync_log row ───
    const { data: logEntry, error: logErr } = await supabase
      .from("sync_log")
      .insert({
        email_account_id: account_id,
        owner_user_id: account.owner_user_id,
        started_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        status: "running",
        batch_complete: true,
        messages_fetched: 0,
        highest_uid_seen: lastUid,
      })
      .select("id")
      .single();
    if (logErr || !logEntry) {
      return json(
        { error: "Failed to create sync log", details: logErr?.message },
        500,
      );
    }
    const logId = logEntry.id;

    console.log(
      `[sync] start account=${account_id} log=${logId} resume_from_uid=${lastUid}`,
    );

    // ─── Heartbeat loop (background, light) ───
    let stillRunning = true;
    let heartbeatStats = { fetched: 0, highestUid: lastUid };
    const heartbeat = setInterval(async () => {
      if (!stillRunning) return;
      try {
        await supabase
          .from("sync_log")
          .update({
            last_heartbeat_at: new Date().toISOString(),
            messages_fetched: heartbeatStats.fetched,
            highest_uid_seen: heartbeatStats.highestUid,
          })
          .eq("id", logId);
      } catch (e) {
        console.error("[sync] heartbeat update failed:", e);
      }
    }, HEARTBEAT_INTERVAL_MS);

    // ─── Fetch password ───
    const { data: password, error: pwErr } = await supabase.rpc(
      "get_email_account_password",
      { p_account_id: account_id },
    );
    if (pwErr || !password) {
      stillRunning = false;
      clearInterval(heartbeat);
      const msg = `Password fetch: ${pwErr?.message ?? "no secret"}`;
      await supabase
        .from("sync_log")
        .update({
          finished_at: new Date().toISOString(),
          last_heartbeat_at: new Date().toISOString(),
          status: "error",
          batch_complete: true,
          error_message: clampError(msg, 500),
        })
        .eq("id", logId);
      await supabase
        .from("email_accounts")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_error: clampError(msg, 500),
        })
        .eq("id", account_id);
      return json({ sync_log_id: logId, status: "error", error: msg }, 200);
    }

    // ─── Run the actual IMAP fetch in foreground, batched ───
    let fetched = 0;
    let created = 0;
    let skipped = 0;
    let highestUid = lastUid;
    let nextUid: number | null = null;
    let batchComplete = true;
    const errors: string[] = [];
    let crashed: string | null = null;

    try {
      const client = new ImapFlow({
        host: account.imap_host,
        port: account.imap_port,
        secure: account.imap_use_tls,
        auth: { user: account.username, pass: String(password) },
        logger: false,
      });

      try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");

        try {
          const range = lastUid > 0 ? `${lastUid + 1}:*` : "1:*";
          console.log(`[sync] log=${logId} fetch range=${range}`);

          for await (
            const msg of client.fetch(
              range,
              { source: true, uid: true, internalDate: true },
              { uid: true },
            )
          ) {
            // Time/size budget — bail and let UI invoke another batch.
            if (
              Date.now() - startedAt > MAX_BATCH_MS ||
              fetched >= MAX_BATCH_MESSAGES
            ) {
              batchComplete = false;
              if (msg.uid) nextUid = msg.uid;
              console.log(
                `[sync] log=${logId} yielding batch at uid=${msg.uid} fetched=${fetched}`,
              );
              break;
            }

            fetched++;
            if (msg.uid && msg.uid > highestUid) highestUid = msg.uid;
            heartbeatStats = { fetched, highestUid };

            try {
              const result = await processMessage(
                msg.source,
                msg.uid ?? 0,
                "INBOX",
                account_id,
                supabase,
              );
              if (result.status === "created") created++;
              else if (result.status === "skipped_duplicate") skipped++;
            } catch (err: any) {
              const m = err?.message ?? String(err);
              console.error(`[sync] log=${logId} uid=${msg.uid} failed:`, m);
              errors.push(`UID ${msg.uid}: ${m}`);
            }
          }
        } finally {
          try { lock.release(); } catch { /* ignore */ }
          await client.logout().catch(() => {});
        }
      } catch (err: any) {
        const m = err?.message ?? String(err);
        console.error(`[sync] log=${logId} IMAP error:`, m);
        errors.push(`IMAP: ${m}`);
      }
    } catch (err: any) {
      crashed = err?.message ?? String(err);
      console.error(`[sync] log=${logId} fatal:`, crashed);
    } finally {
      stillRunning = false;
      clearInterval(heartbeat);
    }

    // ─── Finalize ───
    let status: "ok" | "partial" | "error" = "ok";
    if (crashed) status = "error";
    else if (!batchComplete) status = "partial";
    else if (errors.length > 0 && fetched === 0) status = "error";
    else if (errors.length > 0 && errors.length === fetched) status = "error";
    else if (errors.length > 0) status = "partial";

    const errorMsg = crashed
      ? `Crash: ${crashed}`
      : errors.length > 0
      ? errors.join("; ")
      : null;

    await supabase
      .from("sync_log")
      .update({
        finished_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        status,
        messages_fetched: fetched,
        highest_uid_seen: highestUid,
        next_uid: nextUid,
        batch_complete: batchComplete,
        error_message: clampError(errorMsg, 1000),
      })
      .eq("id", logId);

    await supabase
      .from("email_accounts")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: status,
        last_sync_error: clampError(errorMsg, 500),
      })
      .eq("id", account_id);

    console.log(
      `[sync] done log=${logId} status=${status} fetched=${fetched} created=${created} skipped=${skipped} errors=${errors.length} batch_complete=${batchComplete}`,
    );

    return json(
      {
        sync_log_id: logId,
        status,
        messages_fetched: fetched,
        batch_complete: batchComplete,
        next_uid: nextUid,
        error: errorMsg,
      },
      200,
    );
  } catch (err: any) {
    console.error("[sync] request failed:", err);
    return json({ error: err?.message ?? String(err) }, 500);
  }
});
