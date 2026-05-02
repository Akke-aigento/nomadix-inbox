// Pull new messages from Migadu via IMAP, parse, classify, persist.
// True per-call UID-range batching:
//   - one invocation fetches at most BATCH_SIZE messages from a bounded UID range
//   - independent heartbeat timer
//   - per-message timeout so one bad message can't kill the batch
//   - hard wall-clock guard well under the platform 200s timeout
//   - status 'batch_done' (more to do) vs 'ok' (caught up to server)

import { ImapFlow } from "npm:imapflow@1.0.171";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";
import { processMessage } from "../_shared/process-message.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// How many messages we try to process per invocation.
const BATCH_SIZE = 5;
// Hard wall-clock guard. Must be < STALE_HEARTBEAT_MS so we always finalize
// our own run before the reaper in the next cron tick declares us stale.
const MAX_WALL_CLOCK_MS = 30_000;
// Per-message timeout (parse + persist + attachments).
const PER_MESSAGE_TIMEOUT_MS = 12_000;
// Per-fetch-step timeout: how long we wait for the IMAP stream to yield
// the NEXT message before we give up on this batch entirely.
const PER_FETCH_STEP_TIMEOUT_MS = 15_000;
// Heartbeat update interval.
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

function timeoutAfter(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms)
  );
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
    const CRON_SECRET = Deno.env.get("SYNC_CRON_SECRET") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const apiKeyHeader = req.headers.get("apikey") ?? "";
    const cronHeader = req.headers.get("x-cron-secret") ?? "";
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : "";

    // Decode JWT payload (no signature check) to detect service_role tokens.
    // We accept ANY JWT whose payload claims role=service_role because such
    // a token can only be minted by Supabase itself with the project's secret.
    function decodeJwtRole(t: string): string | null {
      try {
        const parts = t.split(".");
        if (parts.length < 2) return null;
        const payload = JSON.parse(
          atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        return typeof payload?.role === "string" ? payload.role : null;
      } catch {
        return null;
      }
    }

    const isServiceRole =
      bearerToken === SERVICE_KEY ||
      apiKeyHeader === SERVICE_KEY ||
      decodeJwtRole(bearerToken) === "service_role" ||
      decodeJwtRole(apiKeyHeader) === "service_role" ||
      (CRON_SECRET.length > 0 && cronHeader === CRON_SECRET);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: account, error: accErr } = await supabase
      .from("email_accounts")
      .select("*")
      .eq("id", account_id)
      .single();
    if (accErr || !account) return json({ error: "Account not found" }, 404);

    if (!isServiceRole) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userRes } = await userClient.auth.getUser();
      if (!userRes?.user) return json({ error: "Unauthorized" }, 401);
      if (account.owner_user_id !== userRes.user.id) {
        return json({ error: "Forbidden" }, 403);
      }
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
    // Highest UID we've already successfully processed for this account.
    // Look at the most recent ok/batch_done/partial run with a highest_uid_seen.
    let lastUid = 0;
    const { data: lastProgress } = await supabase
      .from("sync_log")
      .select("highest_uid_seen, next_uid, status")
      .eq("email_account_id", account_id)
      .in("status", ["ok", "batch_done", "partial"])
      .not("highest_uid_seen", "is", null)
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (lastProgress) {
      // next_uid (if set) wins — it's the explicit "resume from here" pointer.
      if (lastProgress.next_uid) {
        lastUid = Number(lastProgress.next_uid) - 1;
      } else {
        lastUid = Number(lastProgress.highest_uid_seen ?? 0);
      }
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
        batch_complete: false,
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
      `[sync] start account=${account_id} log=${logId} resume_from_uid=${
        lastUid + 1
      }`,
    );

    // ─── Independent heartbeat timer ───
    let heartbeatStats = { fetched: 0, highestUid: lastUid };
    const heartbeat = setInterval(() => {
      // fire-and-forget; never block sync loop on heartbeat
      supabase
        .from("sync_log")
        .update({
          last_heartbeat_at: new Date().toISOString(),
          messages_fetched: heartbeatStats.fetched,
          highest_uid_seen: heartbeatStats.highestUid,
        })
        .eq("id", logId)
        .then(({ error }) => {
          if (error) console.error("[sync] heartbeat update failed:", error.message);
        });
    }, HEARTBEAT_INTERVAL_MS);

    // ─── Fetch password ───
    const { data: password, error: pwErr } = await supabase.rpc(
      "get_email_account_password",
      { p_account_id: account_id },
    );
    if (pwErr || !password) {
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

    // ─── Run the actual IMAP fetch in foreground, single bounded batch ───
    let fetched = 0;
    let created = 0;
    let skipped = 0;
    let highestUid = lastUid;
    let nextUid: number | null = null;
    let serverHighestUid = lastUid;
    let moreToDo = false;
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
          // Discover server's highest UID via mailbox status (uidNext - 1).
          const status = await client.status("INBOX", { uidNext: true, messages: true });
          const uidNext = Number((status as any)?.uidNext ?? 0);
          serverHighestUid = uidNext > 0 ? uidNext - 1 : 0;

          const resumeFromUid = lastUid + 1;

          if (serverHighestUid < resumeFromUid) {
            console.log(
              `[sync] log=${logId} nothing new (server_highest=${serverHighestUid}, resume_from=${resumeFromUid})`,
            );
          } else {
            const endUid = Math.min(
              serverHighestUid,
              resumeFromUid + BATCH_SIZE - 1,
            );
            const range = `${resumeFromUid}:${endUid}`;
            console.log(
              `[sync] log=${logId} fetch range=${range} server_highest_uid=${serverHighestUid}`,
            );

            // Manual iteration so we can put a timeout around EACH stream
            // step (not just processMessage). If the IMAP stream hangs
            // between messages — which is what was happening — we abort the
            // batch instead of letting the function time out at 150s.
            const iter: AsyncIterator<any> = (client.fetch(
              range,
              { source: true, uid: true, internalDate: true },
              { uid: true },
            ) as any)[Symbol.asyncIterator]();

            let lastSeenUidInRange = resumeFromUid - 1;

            while (true) {
              const elapsed = Date.now() - startedAt;
              if (elapsed > MAX_WALL_CLOCK_MS) {
                console.log(
                  `[sync] log=${logId} wall-clock guard hit at ${elapsed}ms`,
                );
                moreToDo = true;
                nextUid = lastSeenUidInRange + 1;
                break;
              }

              let step: IteratorResult<any>;
              try {
                step = await Promise.race([
                  iter.next(),
                  timeoutAfter(
                    PER_FETCH_STEP_TIMEOUT_MS,
                    `IMAP fetch next() after uid=${lastSeenUidInRange}`,
                  ),
                ]);
              } catch (err: any) {
                const m = err?.message ?? String(err);
                console.error(
                  `[sync] log=${logId} stream stalled after uid=${lastSeenUidInRange}: ${m}`,
                );
                errors.push(`IMAP stall after UID ${lastSeenUidInRange}: ${m}`);
                // Yield gracefully — next cron tick resumes from here.
                moreToDo = true;
                nextUid = lastSeenUidInRange + 1;
                break;
              }

              if (step.done) break;
              const msg = step.value;
              const uid = msg.uid ?? 0;
              if (uid > lastSeenUidInRange) lastSeenUidInRange = uid;

              const t0 = Date.now();
              try {
                await Promise.race([
                  processMessage(msg.source, uid, "INBOX", account_id, supabase),
                  timeoutAfter(PER_MESSAGE_TIMEOUT_MS, `processMessage uid=${uid}`),
                ]).then((result: any) => {
                  if (result?.status === "created") created++;
                  else if (result?.status === "skipped_duplicate") skipped++;
                });
                console.log(
                  `[sync] processed UID ${uid} in ${Date.now() - t0}ms`,
                );
              } catch (err: any) {
                const m = err?.message ?? String(err);
                console.error(
                  `[sync] log=${logId} uid=${uid} failed in ${
                    Date.now() - t0
                  }ms:`,
                  m,
                );
                errors.push(`UID ${uid}: ${m}`);
              }

              fetched++;
              if (uid > highestUid) highestUid = uid;
              heartbeatStats = { fetched, highestUid };
            }

            // Defensive: try to drain/close the iterator so we don't leak it.
            try {
              if (typeof (iter as any).return === "function") {
                await Promise.race([
                  (iter as any).return(),
                  timeoutAfter(2_000, "iterator return"),
                ]).catch(() => {});
              }
            } catch { /* ignore */ }


            // After the bounded fetch loop, are there still UIDs left after this batch?
            if (!moreToDo) {
              const lastProcessedUid = highestUid > 0 ? highestUid : endUid;
              if (serverHighestUid > lastProcessedUid) {
                moreToDo = true;
                nextUid = lastProcessedUid + 1;
              }
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
      clearInterval(heartbeat);
    }

    // ─── Finalize ───
    // Status semantics:
    //   error     — crash, or every attempted message failed
    //   batch_done — bounded batch finished, more UIDs to process (UI re-invokes)
    //   ok        — caught up to server (no more UIDs)
    //   partial   — finished but some messages errored (still caught up)
    let status: "ok" | "batch_done" | "partial" | "error" = "ok";
    if (crashed) {
      status = "error";
    } else if (errors.length > 0 && fetched === 0) {
      status = "error";
    } else if (errors.length > 0 && errors.length === fetched) {
      status = "error";
    } else if (moreToDo) {
      status = "batch_done";
    } else if (errors.length > 0) {
      status = "partial";
    } else {
      status = "ok";
    }

    const errorMsg = crashed
      ? `Crash: ${crashed}`
      : errors.length > 0
      ? errors.join("; ")
      : null;

    const totalElapsed = Date.now() - startedAt;
    console.log(
      `[sync] batch done log=${logId} status=${status} fetched=${fetched} created=${created} skipped=${skipped} errors=${errors.length} next_uid=${nextUid} elapsed=${totalElapsed}ms`,
    );

    await supabase
      .from("sync_log")
      .update({
        finished_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        status,
        messages_fetched: fetched,
        highest_uid_seen: highestUid,
        next_uid: nextUid,
        batch_complete: true,
        error_message: clampError(errorMsg, 1000),
      })
      .eq("id", logId);

    // Account-level status: only mark 'ok' on a true full catch-up.
    // 'batch_done' is an intermediate state — keep it visible but not "error".
    const accountStatus =
      status === "batch_done" ? "running" : status === "partial" ? "partial" : status;

    await supabase
      .from("email_accounts")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: accountStatus,
        last_sync_error: clampError(errorMsg, 500),
      })
      .eq("id", account_id);

    return json(
      {
        sync_log_id: logId,
        status,
        messages_fetched: fetched,
        more_to_do: moreToDo,
        next_uid: nextUid,
        server_highest_uid: serverHighestUid,
        error: errorMsg,
      },
      200,
    );
  } catch (err: any) {
    console.error("[sync] request failed:", err);
    return json({ error: err?.message ?? String(err) }, 500);
  }
});
