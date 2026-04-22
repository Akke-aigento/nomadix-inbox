import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ImapFlow } from "npm:imapflow@1.0.171";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  account_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate the user's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      token,
    );
    if (claimsErr || !claims?.claims) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string | undefined;
    if (!userId) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.account_id || typeof body.account_id !== "string") {
      return json({ ok: false, error: "account_id is required" }, 400);
    }

    // Service-role client to read from vault and account row
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: account, error: accErr } = await admin
      .from("email_accounts")
      .select(
        "id, imap_host, imap_port, imap_use_tls, username, vault_secret_id, owner_user_id",
      )
      .eq("id", body.account_id)
      .maybeSingle();

    if (accErr || !account) {
      return json({ ok: false, error: "Account not found" }, 404);
    }
    if (account.owner_user_id !== userId) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }
    if (!account.vault_secret_id) {
      return json(
        { ok: false, error: "No password set for this account yet" },
        400,
      );
    }

    const { data: secret, error: secretErr } = await admin.rpc(
      "get_vault_secret",
      { secret_id: account.vault_secret_id },
    );
    if (secretErr || !secret) {
      return json({ ok: false, error: "Could not read password from vault" }, 500);
    }

    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_use_tls,
      auth: { user: account.username, pass: secret as string },
      logger: false,
    });

    try {
      await client.connect();
      const mailbox = await client.mailboxOpen("INBOX");
      const mailboxSize = mailbox.exists ?? 0;
      await client.logout();

      // Update sync status to ok
      await admin
        .from("email_accounts")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "ok",
          last_sync_error: null,
        })
        .eq("id", account.id);

      return json({ ok: true, mailbox_size: mailboxSize });
    } catch (imapErr) {
      const message = imapErr instanceof Error ? imapErr.message : String(imapErr);
      await admin
        .from("email_accounts")
        .update({
          last_sync_status: "error",
          last_sync_error: message,
        })
        .eq("id", account.id);
      return json({ ok: false, error: message }, 200);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
