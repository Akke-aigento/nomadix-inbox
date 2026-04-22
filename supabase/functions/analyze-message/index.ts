// Analyze a message via Lovable AI and persist summary, urgency, needs_reply,
// sender_type, requires_action, and (optionally) a brand_categories match.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

interface AnalyzeBody {
  message_id?: string;
  message_ids?: string[];
  limit?: number; // for backfill mode (no ids → fetch up to N unanalyzed)
}

interface AnalysisResult {
  summary: string;
  needs_reply: boolean;
  urgency: "low" | "normal" | "high";
  sender_type: "human" | "automated" | "newsletter" | "transactional" | "spam" | "unknown";
  requires_action: boolean;
  category_slug: string | null;
}

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "record_analysis",
    description:
      "Record the structured analysis of an inbound email message.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: {
          type: "string",
          description:
            "Concise 1-2 sentence summary in the same language as the email (max ~200 chars). Plain text, no greeting echo.",
        },
        needs_reply: {
          type: "boolean",
          description:
            "True if the sender expects a human reply. Newsletters, receipts, no-reply notifications => false.",
        },
        urgency: {
          type: "string",
          enum: ["low", "normal", "high"],
          description:
            "high = explicit deadline / angry customer / blocking issue. low = informational. Default normal.",
        },
        sender_type: {
          type: "string",
          enum: [
            "human",
            "automated",
            "newsletter",
            "transactional",
            "spam",
            "unknown",
          ],
        },
        requires_action: {
          type: "boolean",
          description:
            "True if a non-reply action is required (e.g. process refund, update order, click confirm).",
        },
        category_slug: {
          type: ["string", "null"],
          description:
            "Slug of the best-matching brand category from the provided list, or null if none fits.",
        },
      },
      required: [
        "summary",
        "needs_reply",
        "urgency",
        "sender_type",
        "requires_action",
        "category_slug",
      ],
    },
  },
};

function trimText(s: string | null | undefined, max: number): string {
  if (!s) return "";
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

async function analyzeOne(
  message: any,
  categories: { slug: string; name: string; description: string | null }[],
  apiKey: string,
): Promise<AnalysisResult> {
  const catList = categories.length
    ? categories
        .map(
          (c) =>
            `- ${c.slug}: ${c.name}${c.description ? ` — ${c.description}` : ""}`,
        )
        .join("\n")
    : "(no categories configured for this brand)";

  const system = `You triage inbound business email for a small multi-brand company. \
Classify pragmatically. Reply in the same language as the email. \
Be terse — the summary will be shown in a one-line preview.`;

  const user = `Categories available for this brand:
${catList}

Email metadata:
From: ${message.from_name ?? ""} <${message.from_address}>
To matched: ${message.matched_email_address ?? "(unknown)"}
Subject: ${message.subject ?? "(no subject)"}

Body:
${trimText(message.body_text || message.body_html, 6000)}`;

  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "record_analysis" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI gateway ${resp.status}: ${t.slice(0, 200)}`);
  }

  const json = await resp.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    throw new Error("AI returned no tool call");
  }
  const parsed = JSON.parse(call.function.arguments) as AnalysisResult;
  return parsed;
}

async function persistAnalysis(
  supabase: any,
  message: any,
  result: AnalysisResult,
) {
  // Resolve category by slug (scoped to brand if message has one)
  let categoryId: string | null = null;
  if (result.category_slug && message.brand_id) {
    const { data: cat } = await supabase
      .from("brand_categories")
      .select("id")
      .eq("brand_id", message.brand_id)
      .eq("slug", result.category_slug)
      .maybeSingle();
    if (cat) categoryId = cat.id;
  }

  await supabase
    .from("messages")
    .update({
      ai_summary: result.summary,
      ai_category: result.category_slug,
      ai_category_confidence: categoryId ? 0.9 : null,
      needs_reply: result.needs_reply,
      urgency: result.urgency,
      sender_type: result.sender_type,
      requires_action: result.requires_action,
    })
    .eq("id", message.id);

  if (categoryId) {
    await supabase
      .from("message_categories")
      .upsert(
        {
          message_id: message.id,
          category_id: categoryId,
          owner_user_id: message.owner_user_id,
          detected_via: "ai",
          confidence: 0.9,
        },
        { onConflict: "message_id,category_id" },
      );
  }
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

    const body = (await req.json().catch(() => ({}))) as AnalyzeBody;

    // Build target list
    let targetIds: string[] = [];
    if (body.message_id) targetIds = [body.message_id];
    else if (body.message_ids?.length) targetIds = body.message_ids;
    else {
      const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);
      const { data: pending } = await supabase
        .from("messages")
        .select("id")
        .is("ai_summary", null)
        .eq("is_outbound", false)
        .order("received_at", { ascending: false })
        .limit(limit);
      targetIds = (pending || []).map((m: any) => m.id);
    }

    if (!targetIds.length) {
      return new Response(
        JSON.stringify({ analyzed: 0, errors: 0, skipped: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: messages } = await supabase
      .from("messages")
      .select(
        "id, owner_user_id, brand_id, from_address, from_name, subject, body_text, body_html, matched_email_address",
      )
      .in("id", targetIds);

    let analyzed = 0;
    let errors = 0;
    let skipped = 0;

    // Fetch categories per brand once
    const brandCats = new Map<string, any[]>();

    for (const msg of messages || []) {
      try {
        if (!msg.body_text && !msg.body_html && !msg.subject) {
          skipped++;
          continue;
        }
        let cats: any[] = [];
        if (msg.brand_id) {
          if (!brandCats.has(msg.brand_id)) {
            const { data } = await supabase
              .from("brand_categories")
              .select("slug, name, description")
              .eq("brand_id", msg.brand_id)
              .eq("is_ai_enabled", true)
              .order("sort_order");
            brandCats.set(msg.brand_id, data || []);
          }
          cats = brandCats.get(msg.brand_id) || [];
        }
        const result = await analyzeOne(msg, cats, apiKey);
        await persistAnalysis(supabase, msg, result);
        analyzed++;
      } catch (e) {
        console.error("analyze-message error for", msg.id, e);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ analyzed, errors, skipped, total: targetIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("analyze-message fatal:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
