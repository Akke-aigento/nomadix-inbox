// Brand detection: tier-based using `brand_email_addresses` table with catch-all
// support, plus a Lovable AI fallback (google/gemini-2.5-flash) — no Anthropic
// key required.

export type BrandDetectionMethod =
  | "header_to"
  | "header_cc"
  | "header_forwarded"
  | "header_catch_all"
  | "ai_high"
  | "ai_low"
  | "unknown";

export type BrandDetectionResult = {
  brand_id: string | null;
  method: BrandDetectionMethod;
  confidence: number;
  matched_address?: string | null;
};

type BrandRow = {
  id: string;
  slug: string;
  name: string;
  email_address: string | null;
};

type AddressRow = {
  brand_id: string;
  email_address: string;
  is_catch_all: boolean;
  catch_all_domain: string | null;
};

function extractAddrs(value: any[]): string[] {
  return (value || [])
    .map((a: any) => String(a.address ?? "").toLowerCase().trim())
    .filter(Boolean);
}

function extractForwarded(headers: any): string[] {
  const out: string[] = [];
  const fields = [
    "x-forwarded-to",
    "delivered-to",
    "x-original-to",
    "x-forwarded-for",
  ];
  for (const field of fields) {
    const val =
      typeof headers?.get === "function"
        ? headers.get(field)
        : (headers as any)?.[field];
    if (!val) continue;
    const matches =
      String(val).match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? [];
    for (const m of matches) out.push(m.toLowerCase());
  }
  return out;
}

export async function detectBrand(
  parsed: any,
  supabase: any,
): Promise<BrandDetectionResult> {
  const toAddrs = extractAddrs(parsed.to?.value);
  const ccAddrs = extractAddrs(parsed.cc?.value);
  const forwardedAddrs = extractForwarded(parsed.headers);

  const allAddrs = Array.from(
    new Set([...toAddrs, ...ccAddrs, ...forwardedAddrs]),
  );
  if (allAddrs.length === 0) {
    return { brand_id: null, method: "unknown", confidence: 0 };
  }

  // Pull all candidate explicit addresses + every catch-all in one go.
  const explicitFilter = allAddrs.length > 0
    ? `email_address.in.(${allAddrs.map((a) => `"${a}"`).join(",")})`
    : null;
  const orFilter = explicitFilter
    ? `${explicitFilter},is_catch_all.eq.true`
    : `is_catch_all.eq.true`;

  const { data: matches, error } = await supabase
    .from("brand_email_addresses")
    .select("brand_id, email_address, is_catch_all, catch_all_domain")
    .or(orFilter);

  if (error) {
    console.error("brand_email_addresses lookup failed:", error);
  }

  const rows: AddressRow[] = matches ?? [];

  // Tier 1: To exact
  for (const addr of toAddrs) {
    const m = rows.find((x) => !x.is_catch_all && x.email_address === addr);
    if (m) {
      return {
        brand_id: m.brand_id,
        method: "header_to",
        confidence: 1.0,
        matched_address: addr,
      };
    }
  }

  // Tier 2: CC exact
  for (const addr of ccAddrs) {
    const m = rows.find((x) => !x.is_catch_all && x.email_address === addr);
    if (m) {
      return {
        brand_id: m.brand_id,
        method: "header_cc",
        confidence: 0.85,
        matched_address: addr,
      };
    }
  }

  // Tier 3: Forwarded headers exact
  for (const addr of forwardedAddrs) {
    const m = rows.find((x) => !x.is_catch_all && x.email_address === addr);
    if (m) {
      return {
        brand_id: m.brand_id,
        method: "header_forwarded",
        confidence: 0.9,
        matched_address: addr,
      };
    }
  }

  // Tier 4: Catch-all domain on To / Forwarded
  const catchAlls = rows.filter((x) => x.is_catch_all && x.catch_all_domain);
  for (const addr of [...toAddrs, ...forwardedAddrs]) {
    const domain = addr.split("@")[1];
    if (!domain) continue;
    const ca = catchAlls.find(
      (x) => (x.catch_all_domain ?? "").toLowerCase() === domain,
    );
    if (ca) {
      return {
        brand_id: ca.brand_id,
        method: "header_catch_all",
        confidence: 0.92,
        matched_address: addr,
      };
    }
  }

  // No header match — defer AI detection to background processing.
  // Message will be flagged with needs_brand_detection in process-message.ts.
  return { brand_id: null, method: "unknown", confidence: 0 };
}

async function _detectBrandViaAI(
  parsed: any,
  supabase: any,
): Promise<BrandDetectionResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.warn("LOVABLE_API_KEY missing — skipping AI brand detection");
    return { brand_id: null, method: "unknown", confidence: 0 };
  }

  const { data: brands } = await supabase
    .from("brands")
    .select("id, slug, name, email_address")
    .eq("is_active", true);

  if (!brands?.length) {
    return { brand_id: null, method: "unknown", confidence: 0 };
  }

  const brandList = (brands as BrandRow[])
    .map((b) => `- ${b.slug} (${b.email_address ?? "n/a"}): ${b.name}`)
    .join("\n");
  const bodySnippet = String(parsed.text || parsed.html || "").slice(0, 800);

  const systemPrompt =
    "You are a precise brand classifier. Given an inbound email and a list of brands, return the single best matching brand_slug or null. Respond ONLY via the provided tool.";

  const userPrompt = `Brands:
${brandList}

Email:
From: ${parsed.from?.text ?? "unknown"}
Subject: ${parsed.subject ?? "(no subject)"}
Body excerpt: ${bodySnippet}`;

  try {
    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "classify_brand",
                description: "Return the best matching brand classification.",
                parameters: {
                  type: "object",
                  properties: {
                    brand_slug: {
                      type: ["string", "null"],
                      description:
                        "Slug of the matching brand, or null if no clear match.",
                    },
                    confidence: {
                      type: "number",
                      description: "Confidence between 0 and 1.",
                    },
                    reasoning: {
                      type: "string",
                      description: "One short sentence justifying the choice.",
                    },
                  },
                  required: ["brand_slug", "confidence", "reasoning"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "classify_brand" },
          },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Lovable AI brand-detection error:", response.status, text);
      return { brand_id: null, method: "unknown", confidence: 0 };
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return { brand_id: null, method: "unknown", confidence: 0 };
    }

    const args = JSON.parse(toolCall.function.arguments);
    if (!args.brand_slug) {
      return { brand_id: null, method: "ai_low", confidence: 0 };
    }

    const brand = (brands as BrandRow[]).find((b) => b.slug === args.brand_slug);
    if (!brand) {
      return { brand_id: null, method: "ai_low", confidence: 0 };
    }

    const confidence = Number(args.confidence) || 0;
    return {
      brand_id: brand.id,
      method: confidence >= 0.7 ? "ai_high" : "ai_low",
      confidence,
      matched_address: null,
    };
  } catch (err) {
    console.error("Brand AI detection failed:", err);
    return { brand_id: null, method: "unknown", confidence: 0 };
  }
}
