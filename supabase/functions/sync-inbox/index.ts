// Pull new messages from Migadu via IMAP, parse, classify, persist.
// Returns 202 immediately and processes in the background; UI polls sync_log.

import { ImapFlow } from "npm:imapflow@1.0.171";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";
import { processMessage } from "../_shared/process-message.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function finalizeSync(params: {
  supabase: any;
  account_id: string;
  logId: string;
  fetched: number;
  highestUid: number;
  errors: string[];
  crashed?: string | null;
}) {
  const { supabase, account_id, logId, fetched, highestUid, errors, crashed } = params;
  const allFailed = fetched > 0 && errors.length === fetched;
  let status: "ok" | "error" = "ok";
  if (crashed) status = "error";
  else if (allFailed || (errors.length > 0 && fetched === 0)) status = "error";

  const errorMsg = crashed
    ? `Crash: ${crashed}`.slice(0, 1000)
    : errors.length > 0
    ? errors.join("; ").slice(0, 1000)
    : null;

  await supabase
    .from("sync_log")
    .update({
      finished_at: new Date().toISOString(),
      status,
      messages_fetched: fetched,
      highest_uid_seen: highestUid,
      error_message: errorMsg,
    })
    .eq("id", logId);

  await supabase
    .from("email_accounts")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: crashed
        ? "error"
        : errors.length > 0
        ? allFailed
          ? "error"
          : "partial"
        : "ok",
      last_sync_error: crashed
        ? crashed.slice(0, 500)
        : errors.length > 0
        ? errors[0].slice(0, 500)
        : null,
    })
    .eq("id", account_id);
}

async function runSync(params: {
  supabase: any;
  account: any;
  account_id: string;
  password: string;
  logId: string;
  lastUid: number;
}) {
  const { supabase, account, account_id, password, logId, lastUid } = params;

  let fetched = 0;
  let created = 0;
  let skipped = 0;
  let highestUid = lastUid;
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
        for await (const msg of client.fetch(
          range,
          { source: true, uid: true, internalDate: true },
          { uid: true },
        )) {
          fetched++;
          if (msg.uid && msg.uid > highestUid) highestUid = msg.uid;

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
            console.error(`UID ${msg.uid} failed:`, err);
            errors.push(`UID ${msg.uid}: ${err?.message ?? String(err)}`);
          }
        }
      } finally {
        try { lock.release(); } catch {}
        await client.logout().catch(() => {});
      }
    } catch (err: any) {
      console.error("IMAP error:", err);
      errors.push(`IMAP: ${err?.message ?? String(err)}`);
    }
  } catch (err: any) {
    console.error("Fatal sync error:", err);
    crashed = err?.message ?? String(err);
  } finally {
    // ALWAYS finalize the sync_log row, even if everything above blew up.
    try {
      await finalizeSync({
        supabase,
        account_id,
        logId,
        fetched,
        highestUid,
        errors,
        crashed,
      });
    } catch (finErr) {
      console.error("Failed to finalize sync_log:", finErr);
    }
    console.log(
      `Sync done for ${account_id}: fetched=${fetched} created=${created} skipped=${skipped} errors=${errors.length} crashed=${crashed ?? "no"}`,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    // Service role client for the heavy lifting
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

    // Reap zombie 'running' rows (>5 min old) before starting a new one.
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    await supabase
      .from("sync_log")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: "Auto-closed: orphaned running entry exceeded 5 min timeout",
      })
      .eq("email_account_id", account_id)
      .eq("status", "running")
      .lt("started_at", fiveMinAgo);

    // Open a sync_log entry
    const { data: logEntry, error: logErr } = await supabase
      .from("sync_log")
      .insert({
        email_account_id: account_id,
        owner_user_id: account.owner_user_id,
        started_at: new Date().toISOString(),
        status: "running",
      })
      .select("id")
      .single();
    if (logErr || !logEntry) {
      return json({ error: "Failed to create sync log", details: logErr?.message }, 500);
    }

    // Fetch decrypted password from vault
    const { data: password, error: pwErr } = await supabase.rpc(
      "get_email_account_password",
      { p_account_id: account_id },
    );

    if (pwErr || !password) {
      await supabase
        .from("sync_log")
        .update({
          finished_at: new Date().toISOString(),
          status: "error",
          error_message: `Password fetch: ${pwErr?.message ?? "no secret"}`,
        })
        .eq("id", logEntry.id);
      return json(
        { error: "Password unavailable", details: pwErr?.message },
        500,
      );
    }

    // Find last successfully seen UID for incremental sync
    const { data: lastSync } = await supabase
      .from("sync_log")
      .select("highest_uid_seen")
      .eq("email_account_id", account_id)
      .eq("status", "ok")
      .not("highest_uid_seen", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastUid = lastSync?.highest_uid_seen ?? 0;

    // Kick off background work and return immediately so the browser
    // doesn't hit the 150s edge-function idle timeout.
    // @ts-ignore — EdgeRuntime is provided by Supabase Edge Runtime.
    EdgeRuntime.waitUntil(
      runSync({
        supabase,
        account,
        account_id,
        password: String(password),
        logId: logEntry.id,
        lastUid,
      }).catch(async (err) => {
        console.error("Background sync crashed:", err);
        await supabase
          .from("sync_log")
          .update({
            finished_at: new Date().toISOString(),
            status: "error",
            error_message: `Crash: ${err?.message ?? String(err)}`.slice(0, 1000),
          })
          .eq("id", logEntry.id);
        await supabase
          .from("email_accounts")
          .update({
            last_sync_at: new Date().toISOString(),
            last_sync_status: "error",
            last_sync_error: (err?.message ?? String(err)).slice(0, 500),
          })
          .eq("id", account_id);
      }),
    );

    return json({ sync_log_id: logEntry.id, status: "running" }, 202);
  } catch (err: any) {
    console.error("Sync request failed:", err);
    return json({ error: err?.message ?? String(err) }, 500);
  }
});
