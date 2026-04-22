// Parse a raw RFC822 message, dedupe, detect brand, assemble thread,
// persist message + attachments, and refresh thread stats.

import { simpleParser } from "npm:mailparser@3.7.1";
import { detectBrand } from "./detect-brand.ts";
import { findOrCreateThread, updateThreadStats } from "./thread-assembly.ts";

export type ProcessResult =
  | { status: "skipped_duplicate"; message_id: string }
  | { status: "created"; message_id: string; brand_id: string | null };

export async function processMessage(
  rawSource: any,
  uid: number,
  folder: string,
  emailAccountId: string,
  supabase: any,
): Promise<ProcessResult> {
  const parsed = await simpleParser(rawSource);

  // Dedupe by Message-ID header
  if (parsed.messageId) {
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("message_id_header", parsed.messageId)
      .maybeSingle();
    if (existing) {
      return { status: "skipped_duplicate", message_id: existing.id };
    }
  }

  const { data: account, error: accErr } = await supabase
    .from("email_accounts")
    .select("owner_user_id")
    .eq("id", emailAccountId)
    .single();
  if (accErr || !account) {
    throw new Error(`Account lookup failed: ${accErr?.message ?? "no row"}`);
  }

  const detection = await detectBrand(parsed, supabase);
  const threadId = await findOrCreateThread(
    parsed,
    detection.brand_id,
    account.owner_user_id,
    supabase,
  );

  // Flatten headers Map → JSON object
  const rawHeaders: Record<string, string> = {};
  if (parsed.headers && typeof parsed.headers.forEach === "function") {
    parsed.headers.forEach((value: any, key: string) => {
      rawHeaders[key] = typeof value === "string" ? value : JSON.stringify(value);
    });
  }

  const receivedAt =
    parsed.date instanceof Date
      ? parsed.date.toISOString()
      : new Date().toISOString();

  const { data: message, error: insertErr } = await supabase
    .from("messages")
    .insert({
      owner_user_id: account.owner_user_id,
      thread_id: threadId,
      brand_id: detection.brand_id,
      email_account_id: emailAccountId,
      imap_uid: uid,
      imap_folder: folder,
      message_id_header: parsed.messageId ?? null,
      in_reply_to: parsed.inReplyTo ?? null,
      from_address: parsed.from?.value?.[0]?.address ?? "unknown@unknown",
      from_name: parsed.from?.value?.[0]?.name ?? null,
      to_addresses: parsed.to?.value ?? [],
      cc_addresses: parsed.cc?.value ?? [],
      bcc_addresses: parsed.bcc?.value ?? [],
      reply_to: parsed.replyTo?.value?.[0]?.address ?? null,
      subject: parsed.subject ?? null,
      body_html: parsed.html || null,
      body_text: parsed.text ?? null,
      received_at: receivedAt,
      raw_headers: rawHeaders,
      detected_via: detection.method,
      detection_confidence: detection.confidence,
      is_read: false,
      is_outbound: false,
    })
    .select("id")
    .single();

  if (insertErr) throw insertErr;

  // Attachments
  for (const att of parsed.attachments ?? []) {
    const safeName = (att.filename || "unnamed").replace(/[^\w.\-]+/g, "_");
    const path = `${account.owner_user_id}/${message.id}/${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("message-attachments")
      .upload(path, att.content, {
        contentType: att.contentType ?? "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      console.error("Attachment upload error:", upErr);
      continue;
    }

    await supabase.from("attachments").insert({
      owner_user_id: account.owner_user_id,
      message_id: message.id,
      filename: att.filename ?? safeName,
      mime_type: att.contentType ?? null,
      size_bytes: att.size ?? null,
      content_id: att.cid ?? null,
      is_inline: att.contentDisposition === "inline",
      storage_path: path,
    });
  }

  await updateThreadStats(threadId, supabase);

  return {
    status: "created",
    message_id: message.id,
    brand_id: detection.brand_id,
  };
}
