// Thread assembly: matches by References/In-Reply-To chain, falls back
// to normalized subject within the same brand over the last 7 days.

const SUBJECT_PREFIX_RE = /^(re|fwd|aw|antw|tr|fw|r|wg)\s*:\s*/gi;

function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return "";
  let s = String(subject).trim();
  // Strip multiple stacked Re:/Fwd: prefixes
  for (let i = 0; i < 5; i++) {
    const next = s.replace(SUBJECT_PREFIX_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s.toLowerCase();
}

export async function findOrCreateThread(
  parsed: any,
  brand_id: string | null,
  owner_user_id: string,
  supabase: any,
): Promise<string> {
  // 1. References / In-Reply-To chain
  const refs: string[] = [];
  if (parsed.references) {
    const r = Array.isArray(parsed.references)
      ? parsed.references
      : [parsed.references];
    refs.push(...r.filter(Boolean).map(String));
  }
  if (parsed.inReplyTo) refs.push(String(parsed.inReplyTo));

  if (refs.length > 0) {
    const { data: match } = await supabase
      .from("messages")
      .select("thread_id")
      .in("message_id_header", refs)
      .not("thread_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (match?.thread_id) return match.thread_id;
  }

  // 2. Normalized subject within last 7 days for the same brand
  const normalized = normalizeSubject(parsed.subject);
  if (normalized.length >= 3 && brand_id) {
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recentThreads } = await supabase
      .from("threads")
      .select("id, subject")
      .eq("brand_id", brand_id)
      .gte("last_message_at", sevenDaysAgo)
      .order("last_message_at", { ascending: false })
      .limit(50);

    const match = recentThreads?.find(
      (t: any) => normalizeSubject(t.subject) === normalized,
    );
    if (match) return match.id;
  }

  // 3. Create new thread
  const receivedAt =
    parsed.date instanceof Date
      ? parsed.date.toISOString()
      : new Date().toISOString();

  const { data: newThread, error } = await supabase
    .from("threads")
    .insert({
      owner_user_id,
      brand_id,
      subject: parsed.subject ?? null,
      preview: String(parsed.text ?? "").slice(0, 200),
      last_message_at: receivedAt,
      participants: [parsed.from?.text].filter(Boolean),
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

  await supabase
    .from("threads")
    .update({
      message_count: stats.length,
      unread_count: stats.filter((m: any) => !m.is_read).length,
      last_message_at: lastMessageAt,
      participants,
    })
    .eq("id", threadId);
}
