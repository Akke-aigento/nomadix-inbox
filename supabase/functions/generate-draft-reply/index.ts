// Generate AI draft reply for an inbound message using Lovable AI Gateway.
//
// Inputs:  { message_id: string, force?: boolean }
// Output:  { ai_draft_id: string, status: 'ready' | 'failed' | 'skipped', error?: string, reason?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-pro";

const DRAFT_TOOL = {
  type: "function",
  function: {
    name: "record_draft",
    description:
      "Record the drafted reply email. Body must be HTML (use <p>, <br/>, <ul>, <a>) — no <html>, <head>, or <body> tags.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        subject: {
          type: "string",
          description:
            "Subject line, typically 'Re: <original subject>' unless a better one fits.",
        },
        body_html: {
          type: "string",
          description:
            "The reply body as HTML. Do NOT include the signature — that will be appended automatically.",
        },
        reasoning: {
          type: "string",
          description:
            "1-2 sentences in English explaining the angle taken (used for human review).",
        },
        confidence: {
          type: "string",
          enum: ["low", "medium", "high"],
          description:
            "How confident you are this draft is sendable as-is.",
        },
      },
      required: ["subject", "body_html", "reasoning", "confidence"],
    },
  },
};

function trimText(s: string | null | undefined, max: number): string {
  if (!s) return "";
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface Body {
  message_id?: string;
  force?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.message_id) {
      return new Response(
        JSON.stringify({ error: "message_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch message
    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .select(
        "id, owner_user_id, brand_id, thread_id, from_address, from_name, to_addresses, cc_addresses, subject, body_text, body_html, matched_email_address, is_outbound, sender_type, ai_summary",
      )
      .eq("id", body.message_id)
      .maybeSingle();

    if (msgErr || !msg) {
      return new Response(
        JSON.stringify({ error: "message not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (msg.is_outbound) {
      return new Response(
        JSON.stringify({ status: "skipped", reason: "outbound message" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!msg.brand_id) {
      return new Response(
        JSON.stringify({ status: "skipped", reason: "no brand" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Skip if a draft already exists, unless force
    if (!body.force) {
      const { data: existing } = await supabase
        .from("ai_drafts")
        .select("id, status")
        .eq("message_id", msg.id)
        .maybeSingle();
      if (existing && existing.status === "ready") {
        return new Response(
          JSON.stringify({ ai_draft_id: existing.id, status: "ready", reason: "already exists" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Fetch brand
    const { data: brand } = await supabase
      .from("brands")
      .select(
        "id, name, display_name, ai_draft_tone, ai_draft_language, brand_voice",
      )
      .eq("id", msg.brand_id)
      .maybeSingle();

    if (!brand) {
      return new Response(
        JSON.stringify({ status: "skipped", reason: "brand not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Pick default brand_account for signature
    const { data: accounts } = await supabase
      .from("brand_accounts")
      .select("id, display_name, email_alias, signature_html, is_default, role_title")
      .eq("brand_id", msg.brand_id)
      .order("sort_order", { ascending: true });

    const account = (accounts || []).find((a: any) => a.is_default) ?? (accounts || [])[0] ?? null;

    // Pull recent thread context (last 4 messages excluding current)
    let threadContext = "";
    if (msg.thread_id) {
      const { data: threadMsgs } = await supabase
        .from("messages")
        .select("from_name, from_address, received_at, body_text, body_html, is_outbound, subject")
        .eq("thread_id", msg.thread_id)
        .neq("id", msg.id)
        .order("received_at", { ascending: false })
        .limit(4);
      if (threadMsgs?.length) {
        threadContext = threadMsgs
          .reverse()
          .map((m: any) => {
            const text = m.body_text || (m.body_html ? stripHtml(m.body_html) : "");
            const who = m.is_outbound
              ? `US (${m.from_name || ""} <${m.from_address}>)`
              : `THEM (${m.from_name || ""} <${m.from_address}>)`;
            return `--- ${who} · ${m.received_at}\nSubject: ${m.subject ?? ""}\n${trimText(text, 1500)}`;
          })
          .join("\n\n");
      }
    }

    // Build language directive
    const langMap: Record<string, string> = {
      auto: "Detect the language of the inbound message and reply in that exact language.",
      nl: "Reply in Dutch (Nederlands), tutoyeren tenzij de klant duidelijk formeel is.",
      en: "Reply in English.",
      fr: "Reply in French (Français).",
      de: "Reply in German (Deutsch).",
    };
    const languageDirective = langMap[brand.ai_draft_language] ?? langMap.auto;

    // Build tone directive
    const toneMap: Record<string, string> = {
      professional: "Tone: professional, courteous, clear.",
      casual: "Tone: casual and friendly, like talking to a colleague.",
      warm: "Tone: warm and human, show empathy where appropriate.",
      concise: "Tone: extremely concise — every sentence earns its place.",
    };
    const toneDirective = toneMap[brand.ai_draft_tone] ?? toneMap.professional;

    const voiceBlock = brand.brand_voice?.trim()
      ? `\n\nBrand voice guidelines:\n${brand.brand_voice.trim()}`
      : "";

    const senderName = account?.display_name
      ? `Your name: ${account.display_name}${account.role_title ? ` (${account.role_title})` : ""}`
      : `You are replying on behalf of ${brand.display_name}.`;

    const system = `You are an experienced customer-support / business reply writer for the brand "${brand.display_name}".
${senderName}

${languageDirective}
${toneDirective}${voiceBlock}

Hard rules:
- Reply ONLY to what the inbound message asks. Do NOT invent facts, prices, order numbers, dates or commitments.
- If you do not have enough information to answer fully, say so politely and ask the minimum follow-up question(s) needed.
- Never include placeholders like "[insert order number]". If you cannot fill a value, ask the customer for it.
- Output HTML only (use <p>, <br/>, <ul>, <li>, <a>). No <html>/<head>/<body>. No subject inside the body.
- Do NOT include any greeting that quotes the original or any signature — the signature will be appended automatically.
- Keep it scannable. Short paragraphs.`;

    const inboundBody = msg.body_text || (msg.body_html ? stripHtml(msg.body_html) : "");

    const userMsg = `INBOUND MESSAGE (most recent — reply to THIS):
From: ${msg.from_name ?? ""} <${msg.from_address}>
To (matched): ${msg.matched_email_address ?? "(unknown)"}
Subject: ${msg.subject ?? "(no subject)"}
${msg.ai_summary ? `Triage summary: ${msg.ai_summary}\n` : ""}
Body:
${trimText(inboundBody, 6000)}

${threadContext ? `\nPRIOR THREAD CONTEXT (oldest → newest):\n${threadContext}\n` : ""}
Now draft the reply.`;

    const aiResp = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        tools: [DRAFT_TOOL],
        tool_choice: { type: "function", function: { name: "record_draft" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      const errMsg = `AI gateway ${aiResp.status}: ${t.slice(0, 300)}`;
      // Persist a failed marker so UI can show retry
      const { data: failed } = await supabase
        .from("ai_drafts")
        .upsert(
          {
            message_id: msg.id,
            owner_user_id: msg.owner_user_id,
            brand_id: msg.brand_id,
            brand_account_id: account?.id ?? null,
            draft_subject: null,
            draft_body_html: "",
            draft_body_text: null,
            model_used: DEFAULT_MODEL,
            status: "failed",
            reasoning: errMsg.slice(0, 500),
          },
          { onConflict: "message_id" },
        )
        .select("id")
        .maybeSingle();
      return new Response(
        JSON.stringify({ ai_draft_id: failed?.id ?? null, status: "failed", error: errMsg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await aiResp.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      throw new Error("AI returned no tool call");
    }
    const parsed = JSON.parse(call.function.arguments) as {
      subject: string;
      body_html: string;
      reasoning: string;
      confidence: string;
    };

    const tokensUsed =
      (json.usage?.total_tokens as number | undefined) ??
      (((json.usage?.prompt_tokens ?? 0) + (json.usage?.completion_tokens ?? 0)) || null);

    // Upsert ai_draft (one per message)
    const { data: saved, error: saveErr } = await supabase
      .from("ai_drafts")
      .upsert(
        {
          message_id: msg.id,
          owner_user_id: msg.owner_user_id,
          brand_id: msg.brand_id,
          brand_account_id: account?.id ?? null,
          draft_subject: parsed.subject,
          draft_body_html: parsed.body_html,
          draft_body_text: htmlToText(parsed.body_html),
          model_used: DEFAULT_MODEL,
          status: "ready",
          tokens_used: tokensUsed,
          reasoning: `[${parsed.confidence}] ${parsed.reasoning}`.slice(0, 1000),
          generated_at: new Date().toISOString(),
        },
        { onConflict: "message_id" },
      )
      .select("id")
      .maybeSingle();

    if (saveErr) throw saveErr;

    return new Response(
      JSON.stringify({ ai_draft_id: saved?.id, status: "ready" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-draft-reply fatal:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg, status: "failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
