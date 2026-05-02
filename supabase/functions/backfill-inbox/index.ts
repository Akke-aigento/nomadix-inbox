// One-shot historical backfill via direct IMAP sockets (bypasses ImapFlow stalls).
// Designed to run for up to ~140s and pull as many messages as possible in one go.
// Safe to call repeatedly: resumes from highest UID we already have in `messages`.

import { Buffer } from "node:buffer";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";
import { ImapDirectClient } from "../_shared/imap-direct.ts";
import { processMessage } from "../_shared/process-message.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_WALL_CLOCK_MS = 140_000;
const PER_FETCH_TIMEOUT_MS = 30_000;
const PER_PROCESS_TIMEOUT_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 5_000;

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();

  try {
    const { account_id } = await req.json().catch(() => ({}));
    if (!account_id || typeof account_id !== "string") {
      return json({ error: "account_id required" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ─── Auth: caller must be the account owner OR service role ───
    const authHeader = req.headers.get("Authorization") ?? "";
    const apiKeyHeader = req.headers.get("apikey") ?? "";
    const cronHeader = req.headers.get("x-cron-secret") ?? "";
    const CRON_SECRET = Deno.env.get("SYNC_CRON_SECRET") ?? "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";

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
      bearer === SERVICE_KEY ||
      apiKeyHeader === SERVICE_KEY ||
      decodeJwtRole(bearer) === "service_role" ||
      decodeJwtRole(apiKeyHeader) === "service_role" ||
      (CRON_SECRET.length > 0 && cronHeader === CRON_SECRET);

    console.log(`[backfill] auth: isServiceRole=${isServiceRole} bearer_len=${bearer.length} apikey_len=${apiKeyHeader.length}`);

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

    // ─── Determine resume point: highest UID we already have ───
    const { data: maxRow } = await supabase
      .from("messages")
      .select("imap_uid")
      .eq("email_account_id", account_id)
      .not("imap_uid", "is", null)
      .order("imap_uid", { ascending: false })
      .limit(1)
      .maybeSingle();
    const resumeFrom = (Number(maxRow?.imap_uid ?? 0) || 0) + 1;

    // ─── Open sync_log row ───
    const { data: logEntry } = await supabase
      .from("sync_log")
      .insert({
        email_account_id: account_id,
        owner_user_id: account.owner_user_id,
        started_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        status: "running",
        batch_complete: false,
        messages_fetched: 0,
        highest_uid_seen: resumeFrom - 1,
      })
      .select("id")
      .single();
    const logId = logEntry?.id;

    // ─── Heartbeat ───
    let stats = { fetched: 0, highestUid: resumeFrom - 1 };
    const heartbeat = setInterval(() => {
      if (!logId) return;
      supabase
        .from("sync_log")
        .update({
          last_heartbeat_at: new Date().toISOString(),
          messages_fetched: stats.fetched,
          highest_uid_seen: stats.highestUid,
        })
        .eq("id", logId)
        .then(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    // ─── Fetch IMAP password ───
    const { data: password, error: pwErr } = await supabase.rpc(
      "get_email_account_password",
      { p_account_id: account_id },
    );
    if (pwErr || !password) {
      clearInterval(heartbeat);
      const msg = `Password fetch: ${pwErr?.message ?? "no secret"}`;
      if (logId) {
        await supabase.from("sync_log").update({
          finished_at: new Date().toISOString(),
          status: "error",
          batch_complete: true,
          error_message: clampError(msg),
        }).eq("id", logId);
      }
      return json({ error: msg }, 500);
    }

    let fetched = 0;
    let created = 0;
    let skipped = 0;
    let errored = 0;
    let serverHighest = 0;
    let processedUids: number[] = [];
    const errors: string[] = [];
    let crashed: string | null = null;
    let moreToDo = false;

    const client = new ImapDirectClient({
      host: account.imap_host,
      port: account.imap_port,
      username: account.username,
      password: String(password),
    });

    try {
      await client.connect(15_000);
      await client.login();
      const sel = await client.selectInbox();
      serverHighest = sel.uidNext > 0 ? sel.uidNext - 1 : 0;

      console.log(`[backfill] log=${logId} resume_from=${resumeFrom} server_highest=${serverHighest}`);

      if (serverHighest >= resumeFrom) {
        const allUids = await client.uidSearchRange(resumeFrom, "*");
        console.log(`[backfill] log=${logId} ${allUids.length} UIDs to fetch`);

        for (const uid of allUids) {
          if (Date.now() - startedAt > MAX_WALL_CLOCK_MS) {
            moreToDo = true;
            console.log(`[backfill] log=${logId} wall-clock guard hit at uid=${uid}`);
            break;
          }

          let msg: { uid: number; source: Uint8Array } | null = null;
          try {
            msg = await Promise.race([
              client.fetchOne(uid, PER_FETCH_TIMEOUT_MS),
              timeoutAfter(PER_FETCH_TIMEOUT_MS, `fetch uid=${uid}`),
            ]);
          } catch (err: any) {
            const m = err?.message ?? String(err);
            console.error(`[backfill] uid=${uid} fetch failed: ${m}`);
            errors.push(`UID ${uid} fetch: ${m}`);
            errored++;
            stats = { fetched, highestUid: Math.max(stats.highestUid, uid) };
            continue;
          }

          if (!msg) {
            console.warn(`[backfill] uid=${uid} no source returned`);
            stats = { fetched, highestUid: Math.max(stats.highestUid, uid) };
            continue;
          }

          try {
            const buf = Buffer.from(msg.source);
            const result: any = await Promise.race([
              processMessage(buf, uid, "INBOX", account_id, supabase),
              timeoutAfter(PER_PROCESS_TIMEOUT_MS, `process uid=${uid}`),
            ]);
            if (result?.status === "created") created++;
            else if (result?.status === "skipped_duplicate") skipped++;
            fetched++;
            processedUids.push(uid);
          } catch (err: any) {
            const m = err?.message ?? String(err);
            console.error(`[backfill] uid=${uid} process failed: ${m}`);
            errors.push(`UID ${uid} process: ${m}`);
            errored++;
          }

          stats = { fetched, highestUid: Math.max(stats.highestUid, uid) };
        }
      }
    } catch (err: any) {
      crashed = err?.message ?? String(err);
      console.error(`[backfill] fatal: ${crashed}`);
    } finally {
      clearInterval(heartbeat);
      try { await client.logout(); } catch { /* ignore */ }
    }

    const status = crashed
      ? "error"
      : moreToDo
      ? "batch_done"
      : errors.length > 0 && fetched === 0
      ? "error"
      : errors.length > 0
      ? "partial"
      : "ok";

    const finalHighest = Math.max(stats.highestUid, resumeFrom - 1);
    const errorMsg = crashed
      ? `Crash: ${crashed}`
      : errors.length > 0
      ? errors.slice(0, 5).join("; ")
      : null;

    const elapsed = Date.now() - startedAt;
    console.log(
      `[backfill] done log=${logId} status=${status} fetched=${fetched} created=${created} skipped=${skipped} errored=${errored} highest=${finalHighest} server=${serverHighest} elapsed=${elapsed}ms`,
    );

    if (logId) {
      await supabase.from("sync_log").update({
        finished_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        status,
        messages_fetched: fetched,
        highest_uid_seen: finalHighest,
        next_uid: moreToDo ? finalHighest + 1 : null,
        batch_complete: true,
        error_message: clampError(errorMsg, 1000),
      }).eq("id", logId);
    }

    await supabase.from("email_accounts").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: status === "batch_done" ? "running" : status,
      last_sync_error: clampError(errorMsg, 500),
    }).eq("id", account_id);

    return json({
      sync_log_id: logId,
      status,
      messages_fetched: fetched,
      created,
      skipped,
      errored,
      highest_uid_seen: finalHighest,
      server_highest_uid: serverHighest,
      more_to_do: moreToDo,
      elapsed_ms: elapsed,
      error: errorMsg,
    });
  } catch (err: any) {
    console.error("[backfill] request failed:", err);
    return json({ error: err?.message ?? String(err) }, 500);
  }
});
