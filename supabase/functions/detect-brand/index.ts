// TODO (Phase 3): Brand detection for inbound messages.
//
// Strategy:
// 1. Header parse — match To/Cc/Delivered-To/X-Forwarded-To against brands.email_address.
//    On match: detected_via = 'header_to' | 'header_cc', confidence = 1.00.
// 2. AI fallback — when no header match, call Lovable AI Gateway (e.g. google/gemini-2.5-flash)
//    with the message metadata + body excerpt and the list of brands. Model returns brand_slug
//    and confidence. Store as detected_via = 'ai_high' (>= 0.75) or 'ai_low' (< 0.75).
// 3. Update messages.brand_id, detected_via, detection_confidence.
//
// Inputs: { message_id: string }
// Output: { brand_id: string | null, detected_via: string, detection_confidence: number }

import "https://deno.land/x/xhr@0.1.0/mod.ts";

Deno.serve(async (_req) => {
  return new Response(
    JSON.stringify({ ok: false, error: "Not implemented yet (Phase 3)" }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
});
