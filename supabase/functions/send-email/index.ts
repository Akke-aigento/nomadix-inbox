// Send an outbound email via Migadu SMTP and persist it to the messages table.
//
// Body:
// {
//   thread_id?: string,          // existing thread to reply into
//   in_reply_to_message_id?: string, // message we're replying to (for headers + threading)
//   brand_id: string,
//   brand_account_id: string,    // determines From + signature
//   from_email: string,          // email_alias or matched_email_address
//   to: string[],
//   cc?: string[],
//   bcc?: string[],
//   subject: string,
//   body_html: string,
//   draft_id?: string,           // if set, this draft will be deleted after send
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function makeMessageId(domain: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "");
  return `<${rand}@${domain}>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User-scoped client to verify auth
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json();
    const {
      thread_id,
      in_reply_to_message_id,
      brand_id,
      brand_account_id,
      from_email,
      to,
      cc = [],
      bcc = [],
      subject,
      body_html,
      draft_id,
    } = body ?? {};

    if (!brand_id || !brand_account_id || !from_email || !to?.length || !subject || !body_html) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    // Service-role client for cross-table writes
    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // Load brand_account (for display_name + signature) — verify ownership
    const { data: account, error: accErr } = await admin
      .from("brand_accounts")
      .select("id, display_name, signature_html, brand_id, owner_user_id")
      .eq("id", brand_account_id)
      .maybeSingle();
    if (accErr || !account || account.owner_user_id !== userId) {
      return jsonResponse({ error: "Brand account not found" }, 404);
    }

    // Get the email account for this user (currently single account per user)
    const { data: emailAccount, error: eaErr } = await admin
      .from("email_accounts")
      .select("id, username, smtp_host, smtp_port, smtp_use_tls")
      .eq("owner_user_id", userId)
      .limit(1)
      .maybeSingle();
    if (eaErr || !emailAccount) {
      return jsonResponse({ error: "No email account configured" }, 400);
    }

    // Fetch SMTP password
    const { data: pwd, error: pwdErr } = await admin.rpc("get_email_account_password", {
      p_account_id: emailAccount.id,
    });
    if (pwdErr || !pwd) {
      return jsonResponse({ error: "Could not fetch SMTP credentials" }, 500);
    }

    // Threading headers
    let inReplyToHeader: string | undefined;
    let referencesHeader: string | undefined;
    let originalSubject: string | null = null;
    if (in_reply_to_message_id) {
      const { data: parent } = await admin
        .from("messages")
        .select("message_id_header, raw_headers, subject")
        .eq("id", in_reply_to_message_id)
        .maybeSingle();
      if (parent?.message_id_header) {
        inReplyToHeader = parent.message_id_header;
        const parentRefs =
          (parent.raw_headers as any)?.references ||
          (parent.raw_headers as any)?.References ||
          "";
        const refList = [
          ...(typeof parentRefs === "string" ? parentRefs.split(/\s+/) : parentRefs),
          parent.message_id_header,
        ]
          .filter(Boolean)
          .join(" ");
        referencesHeader = refList;
        originalSubject = parent.subject;
      }
    }

    const fromDomain = from_email.split("@")[1] || "localhost";
    const newMessageId = makeMessageId(fromDomain);

    // Build SMTP client (Migadu uses 465 SSL or 587 STARTTLS)
    const usePort = emailAccount.smtp_port ?? 465;
    const useTls = emailAccount.smtp_use_tls ?? true;

    const smtp = new SMTPClient({
      connection: {
        hostname: emailAccount.smtp_host || "smtp.migadu.com",
        port: usePort,
        tls: useTls && usePort === 465,
        auth: {
          username: emailAccount.username,
          password: pwd,
        },
      },
    });

    const headers: Record<string, string> = {
      "Message-ID": newMessageId,
    };
    if (inReplyToHeader) headers["In-Reply-To"] = inReplyToHeader;
    if (referencesHeader) headers["References"] = referencesHeader;

    const fromHeader = account.display_name
      ? `${account.display_name} <${from_email}>`
      : from_email;

    try {
      await smtp.send({
        from: fromHeader,
        to: to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        subject,
        html: body_html,
        headers,
      });
      await smtp.close();
    } catch (e) {
      console.error("SMTP send failed:", e);
      try { await smtp.close(); } catch (_) { /* ignore */ }
      return jsonResponse({ error: `SMTP error: ${String((e as Error).message ?? e)}` }, 502);
    }

    // Persist as outbound message in the thread
    const receivedAt = new Date().toISOString();
    const { data: insertedMsg, error: insErr } = await admin
      .from("messages")
      .insert({
        owner_user_id: userId,
        thread_id: thread_id ?? null,
        email_account_id: emailAccount.id,
        brand_id,
        message_id_header: newMessageId,
        in_reply_to: inReplyToHeader ?? null,
        from_address: from_email,
        from_name: account.display_name,
        to_addresses: to.map((address: string) => ({ address })),
        cc_addresses: cc.map((address: string) => ({ address })),
        bcc_addresses: bcc.map((address: string) => ({ address })),
        subject,
        body_html,
        body_text: null,
        received_at: receivedAt,
        is_read: true,
        is_outbound: true,
        matched_email_address: from_email,
        detected_via: "outbound",
        raw_headers: { "Message-ID": newMessageId, "In-Reply-To": inReplyToHeader, References: referencesHeader },
      })
      .select("id, thread_id")
      .single();

    if (insErr) {
      console.error("Failed to persist outbound message:", insErr);
      return jsonResponse({ error: "Sent but failed to record locally" }, 500);
    }

    // Update thread stats if applicable
    if (insertedMsg.thread_id) {
      const { data: stats } = await admin
        .from("messages")
        .select("received_at, is_read, from_address")
        .eq("thread_id", insertedMsg.thread_id);
      if (stats?.length) {
        const sortedDates = stats
          .map((m: any) => m.received_at)
          .filter(Boolean)
          .sort();
        await admin
          .from("threads")
          .update({
            message_count: stats.length,
            unread_count: stats.filter((m: any) => !m.is_read).length,
            last_message_at: sortedDates[sortedDates.length - 1],
            updated_at: receivedAt,
          })
          .eq("id", insertedMsg.thread_id);
      }
    }

    // Cleanup draft if provided
    if (draft_id) {
      await admin.from("drafts").delete().eq("id", draft_id).eq("owner_user_id", userId);
    }

    return jsonResponse({
      ok: true,
      message_id: insertedMsg.id,
      thread_id: insertedMsg.thread_id,
    });
  } catch (err) {
    console.error("send-email error:", err);
    return jsonResponse({ error: String((err as Error).message ?? err) }, 500);
  }
});
