// Thread assembly.
//  1. References / In-Reply-To chain (owner-scoped).
//  2. Subject fallback — only for a non-automated *reply* ("Re:" subject or
//     an unmatched References chain) from the same counterpart, within 30
//     days before the message's own date. The old fallback (any mail with the
//     same subject and brand in the last 7 days) glued unrelated notifications
//     together: 29 threads / 112 messages on 2026-09-18.
//  3. New thread.

import {
  isAutomated,
  isReplySubject,
  normalizeRefs,
  normalizeSubject,
  pickSubjectMatch,
  SUBJECT_FALLBACK_WINDOW_DAYS,
} from "./threading-rules.ts";

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function findOrCreateThread(
  parsed: any,
  brand_id: string | null,
  owner_user_id: string,
  supabase: any,
): Promise<string> {
  const receivedAt =
    parsed.date instanceof Date && !Number.isNaN(parsed.date.getTime())
      ? parsed.date.toISOString()
      : new Date().toISOString();

  // 1. References / In-Reply-To chain
  const refs = Array.from(
    new Set([...normalizeRefs(parsed.references), ...normalizeRefs(parsed.inReplyTo)]),
  );

  if (refs.length > 0) {
    const { data: match } = await supabase
      .from("messages")
      .select("thread_id")
      .eq("owner_user_id", owner_user_id)
      .in("message_id_header", refs)
      .not("thread_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (match?.thread_id) return match.thread_id;
  }

  // 2. Subject fallback — strict (see header comment)
  const normalized = normalizeSubject(parsed.subject);
  const counterpart = String(parsed.from?.value?.[0]?.address ?? "").toLowerCase();
  const isReply = isReplySubject(parsed.subject) || refs.length > 0;
  if (
    normalized.length >= 3 &&
    counterpart &&
    isReply &&
    !isAutomated(parsed.headers, counterpart)
  ) {
    const until = new Date(receivedAt);
    const since = new Date(until.getTime() - SUBJECT_FALLBACK_WINDOW_DAYS * 86_400_000);
    const { data: candidates } = await supabase
      .from("messages")
      .select("thread_id, subject, from_address, to_addresses, received_at")
      .eq("owner_user_id", owner_user_id)
      .gte("received_at", since.toISOString())
      .lte("received_at", until.toISOString())
      .ilike("subject", `%${escapeLike(normalized)}%`)
      .not("thread_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(50);
    const threadId = pickSubjectMatch(candidates ?? [], normalized, counterpart);
    if (threadId) return threadId;
  }

  // 3. Create new thread

  const { data: newThread, error } = await supabase
    .from("threads")
    .insert({
      owner_user_id,
      brand_id,
      subject: parsed.subject ?? null,
      preview: String(parsed.text ?? "").slice(0, 200),
      last_message_at: receivedAt,
      // Same shape updateThreadStats writes: bare addresses.
      participants: [parsed.from?.value?.[0]?.address].filter(Boolean),
      message_count: 0,
      unread_count: 0,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Thread creation failed: ${error.message}`);
  return newThread.id;
}

export async function updateThreadStats(
  threadId: string,
  supabase: any,
  opts: { newInboundReceivedAt?: string | null } = {},
): Promise<void> {
  const { data: stats } = await supabase
    .from("messages")
    .select("received_at, is_read, from_address")
    .eq("thread_id", threadId);

  if (!stats?.length) return;

  const sortedDates = stats
    .map((m: any) => m.received_at)
    .filter(Boolean)
    .sort();
  const lastMessageAt = sortedDates[sortedDates.length - 1];
  const participants = Array.from(
    new Set(stats.map((m: any) => m.from_address).filter(Boolean)),
  );

  // A new inbound reply pulls an archived thread back into the inbox — but
  // only when it is the newest message, so a backfill of old mail never
  // un-archives threads the user already dealt with.
  const incoming = opts.newInboundReceivedAt;
  const unarchive =
    !!incoming && !!lastMessageAt && new Date(incoming).getTime() >= new Date(lastMessageAt).getTime();

  await supabase
    .from("threads")
    .update({
      message_count: stats.length,
      unread_count: stats.filter((m: any) => !m.is_read).length,
      last_message_at: lastMessageAt,
      participants,
      ...(unarchive ? { is_archived: false } : {}),
    })
    .eq("id", threadId);
}
