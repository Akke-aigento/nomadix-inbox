// Brand detection: tier-based (To/CC/Forwarded headers) with Lovable AI fallback.
// Uses google/gemini-2.5-flash via Lovable AI Gateway — no Anthropic key needed.

export type BrandDetectionMethod =
  | "header_to"
  | "header_cc"
  | "header_forwarded"
  | "ai_high"
  | "ai_low"
  | "unknown";

export type BrandDetectionResult = {
  brand_id: string | null;
  method: BrandDetectionMethod;
  confidence: number;
};

type BrandRow = {
  id: string;
  email_address: string;
  slug: string;
  name: string;
};

export async function detectBrand(
  parsed: any,
  supabase: any,
): Promise<BrandDetectionResult> {
  const { data: brands } = await supabase
    .from("brands")
    .select("id, email_address, slug, name")
    .eq("is_active", true);

  if (!brands?.length) {
    return { brand_id: null, method: "unknown", confidence: 0 };
  }

  const brandByEmail = new Map<string, BrandRow>(
    brands.map((b: BrandRow) => [b.email_address.toLowerCase(), b]),
  );

  // Tier 1: To
  for (const addr of parsed.to?.value ?? []) {
    const hit = brandByEmail.get(String(addr.address ?? "").toLowerCase());
    if (hit) return { brand_id: hit.id, method: "header_to", confidence: 1.0 };
  }

  // Tier 2: CC
  for (const addr of parsed.cc?.value ?? []) {
    const hit = brandByEmail.get(String(addr.address ?? "").toLowerCase());
    if (hit) return { brand_id: hit.id, method: "header_cc", confidence: 0.85 };
  }

  // Tier 3: Forwarded headers (Cloudflare Email Routing adds these)
  const headers = parsed.headers;
  const forwardFields = [
    "x-forwarded-to",
    "delivered-to",
    "x-original-to",
    "x-forwarded-for",
  ];
  for (const field of forwardFields) {
    const val =
      typeof headers?.get === "function"
        ? headers.get(field)
        : (headers as any)?.[field];
    if (!val) continue;
    const matches = String(val).match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? [];
    for (const email of matches) {
      const hit = brandByEmail.get(email.toLowerCase());
      if (hit) {
        return {
          brand_id: hit.id,
          method: "header_forwarded",
          confidence: 0.9,
        };
      }
    }
  }

  // Tier 4: Lovable AI fallback
  return await detectBrandViaAI(parsed, brands);
}

async function detectBrandViaAI(
  parsed: any,
  brands: BrandRow[],
): Promise<BrandDetectionResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.warn("LOVABLE_API_KEY missing — skipping AI brand detection");
    return { brand_id: null, method: "unknown", confidence: 0 };
  }

  const brandList = brands
    .map((b) => `- ${b.slug} (${b.email_address}): ${b.name}`)
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

    const brand = brands.find((b) => b.slug === args.brand_slug);
    if (!brand) {
      return { brand_id: null, method: "ai_low", confidence: 0 };
    }

    const confidence = Number(args.confidence) || 0;
    return {
      brand_id: brand.id,
      method: confidence >= 0.7 ? "ai_high" : "ai_low",
      confidence,
    };
  } catch (err) {
    console.error("Brand AI detection failed:", err);
    return { brand_id: null, method: "unknown", confidence: 0 };
  }
}
