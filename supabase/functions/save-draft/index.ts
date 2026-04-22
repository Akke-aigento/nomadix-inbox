// Upsert a draft for the current user. Used by the composer for autosave.
//
// Body:
// {
//   draft_id?: string,  // if present, update; else insert
//   brand_id: string,
//   in_reply_to_message_id?: string,
//   subject?: string,
//   body_html?: string,
//   to_addresses?: string[],
//   cc_addresses?: string[],
//   bcc_addresses?: string[],
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await client.auth.getUser();
    if (userErr || !userData.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const {
      draft_id,
      brand_id,
      in_reply_to_message_id,
      subject,
      body_html,
      to_addresses = [],
      cc_addresses = [],
      bcc_addresses = [],
    } = body ?? {};

    if (!brand_id) return jsonResponse({ error: "brand_id required" }, 400);

    const payload = {
      brand_id,
      in_reply_to_message_id: in_reply_to_message_id ?? null,
      subject: subject ?? null,
      body_html: body_html ?? null,
      to_addresses: to_addresses.map((address: string) => ({ address })),
      cc_addresses: cc_addresses.map((address: string) => ({ address })),
      bcc_addresses: bcc_addresses.map((address: string) => ({ address })),
      updated_at: new Date().toISOString(),
    };

    if (draft_id) {
      const { data, error } = await client
        .from("drafts")
        .update(payload)
        .eq("id", draft_id)
        .select("id")
        .maybeSingle();
      if (error) return jsonResponse({ error: error.message }, 400);
      if (!data) return jsonResponse({ error: "Draft not found" }, 404);
      return jsonResponse({ draft_id: data.id });
    }

    const { data, error } = await client
      .from("drafts")
      .insert(payload)
      .select("id")
      .single();
    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ draft_id: data.id });
  } catch (err) {
    return jsonResponse({ error: String((err as Error).message ?? err) }, 500);
  }
});
