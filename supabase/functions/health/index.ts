// Read-only health endpoint. Requires header: x-health-token
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-health-token",
};

type Status = "ok" | "warn" | "fail";
type Check = { key: string; status: Status; detail: unknown };

const RANK: Record<Status, number> = { ok: 0, warn: 1, fail: 2 };

function worst(list: Status[]): Status {
  return list.reduce<Status>((acc, s) => (RANK[s] > RANK[acc] ? s : acc), "ok");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ─── Auth: x-health-token must match private.config value ───
  const { data: expectedToken, error: tokenErr } = await supabase.rpc(
    "get_health_token",
  );
  if (tokenErr || !expectedToken) {
    return json({ error: "Health token not configured" }, 500);
  }
  const provided = req.headers.get("x-health-token") ?? "";
  if (provided !== String(expectedToken)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const now = Date.now();
  const checks: Check[] = [];

  // ─── 1. mail_sync ───
  {
    const { data, error } = await supabase
      .from("email_accounts")
      .select("label, last_sync_at, last_sync_status, last_sync_error");

    if (error) {
      checks.push({ key: "mail_sync", status: "fail", detail: { error: error.message } });
    } else {
      const accounts = (data ?? []).map((a) => {
        const minutesAgo = a.last_sync_at
          ? Math.round((now - new Date(a.last_sync_at).getTime()) / 60_000)
          : null;
        return {
          label: a.label,
          last_sync_at: a.last_sync_at,
          minutes_ago: minutesAgo,
          last_sync_status: a.last_sync_status,
          last_sync_error: a.last_sync_error,
        };
      });

      const statuses: Status[] = accounts.map((a) => {
        if (a.last_sync_status === "error") return "fail";
        if (a.minutes_ago === null || a.minutes_ago > 60) return "fail";
        if (a.minutes_ago > 15) return "warn";
        return "ok";
      });

      checks.push({
        key: "mail_sync",
        status: worst(statuses),
        detail: { accounts },
      });
    }
  }

  // ─── 2. stalled_syncs ───
  {
    const cutoff = new Date(now - 10 * 60_000).toISOString();
    const { data, error } = await supabase
      .from("sync_log")
      .select("id, last_heartbeat_at")
      .eq("status", "running")
      .lt("last_heartbeat_at", cutoff)
      .order("last_heartbeat_at", { ascending: true });

    if (error) {
      checks.push({ key: "stalled_syncs", status: "fail", detail: { error: error.message } });
    } else {
      const rows = data ?? [];
      checks.push({
        key: "stalled_syncs",
        status: rows.length > 0 ? "warn" : "ok",
        detail: {
          count: rows.length,
          oldest_last_heartbeat_at: rows[0]?.last_heartbeat_at ?? null,
        },
      });
    }
  }

  // ─── 3. recent_sync_errors ───
  {
    const since = new Date(now - 24 * 60 * 60_000).toISOString();
    const { data, error } = await supabase
      .from("sync_log")
      .select("error_message, started_at")
      .not("error_message", "is", null)
      .neq("error_message", "")
      .gte("started_at", since)
      .order("started_at", { ascending: false });

    if (error) {
      checks.push({ key: "recent_sync_errors", status: "fail", detail: { error: error.message } });
    } else {
      const rows = data ?? [];
      checks.push({
        key: "recent_sync_errors",
        status: rows.length > 0 ? "warn" : "ok",
        detail: {
          count: rows.length,
          most_recent_error: rows[0]?.error_message ?? null,
        },
      });
    }
  }

  return json({
    status: worst(checks.map((c) => c.status)),
    generated_at: new Date(now).toISOString(),
    checks,
  });
});
