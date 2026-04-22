// TODO (Phase 4): Generate AI draft reply for an inbound message.
//
// Strategy:
// 1. Load message + thread context + brand (with brand_voice, ai_draft_tone, ai_draft_language).
// 2. Pick brand_account (default for the brand) for signature.
// 3. Build system prompt:
//      - Role: drafting reply on behalf of {brand.display_name}
//      - Voice: {brand.brand_voice}
//      - Tone: {brand.ai_draft_tone}
//      - Language: {brand.ai_draft_language} (or detect from inbound)
//      - Append signature: {brand_account.signature_html}
// 4. Call Lovable AI Gateway (default: google/gemini-2.5-pro for quality, or claude-sonnet-4-5 via API).
// 5. Insert into ai_drafts (status='ready', model_used, tokens_used, reasoning).
//
// Inputs: { message_id: string, force?: boolean }
// Output: { ai_draft_id: string, status: 'ready' | 'failed', error?: string }

import "https://deno.land/x/xhr@0.1.0/mod.ts";

Deno.serve(async (_req) => {
  return new Response(
    JSON.stringify({ ok: false, error: "Not implemented yet (Phase 4)" }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
});
