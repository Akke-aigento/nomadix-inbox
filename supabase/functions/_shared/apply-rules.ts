// Routing rules engine: load active rules for an owner, evaluate against a
// message row, and apply matching actions (add label, add category, set
// urgency, mark read, archive thread). Designed to be called from
// process-message (right after insert) AND from analyze-message (after AI
// has filled in brand_id / category, in case rules depend on those).
//
// Idempotent: safe to run multiple times per message — duplicate label /
// category links use upsert with onConflict so they will not insert twice,
// and we update rule statistics with a single increment per match.

export interface RuleRow {
  id: string;
  owner_user_id: string;
  name: string;
  is_active: boolean;
  priority: number;
  match_from_contains: string | null;
  match_subject_contains: string | null;
  match_to_contains: string | null;
  match_has_header: string | null;
  match_brand_id: string | null;
  action_add_label_id: string | null;
  action_add_category_id: string | null;
  action_set_urgency: string | null;
  action_mark_read: boolean;
  action_archive: boolean;
  times_matched: number;
}

export interface MessageForRules {
  id: string;
  owner_user_id: string;
  thread_id: string | null;
  brand_id: string | null;
  from_address: string;
  subject: string | null;
  to_addresses: unknown;
  cc_addresses?: unknown;
  raw_headers: unknown;
}

export interface ApplyResult {
  matched_rule_ids: string[];
  applied_label_ids: string[];
  applied_category_ids: string[];
  archived: boolean;
  marked_read: boolean;
  set_urgency: string | null;
}

function jsonContains(value: unknown, needle: string): boolean {
  if (!needle) return true;
  if (value == null) return false;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.toLowerCase().includes(needle.toLowerCase());
}

function headerPresent(headers: unknown, name: string): boolean {
  if (!name) return true;
  if (!headers || typeof headers !== "object") return false;
  const lowerName = name.toLowerCase();
  return Object.keys(headers as Record<string, unknown>).some(
    (k) => k.toLowerCase() === lowerName,
  );
}

export function ruleMatches(rule: RuleRow, msg: MessageForRules): boolean {
  if (
    rule.match_from_contains &&
    !jsonContains(msg.from_address, rule.match_from_contains)
  )
    return false;
  if (
    rule.match_subject_contains &&
    !jsonContains(msg.subject ?? "", rule.match_subject_contains)
  )
    return false;
  if (rule.match_to_contains) {
    const toBlob = JSON.stringify([msg.to_addresses, msg.cc_addresses ?? []]);
    if (!jsonContains(toBlob, rule.match_to_contains)) return false;
  }
  if (
    rule.match_has_header &&
    !headerPresent(msg.raw_headers, rule.match_has_header)
  )
    return false;
  if (rule.match_brand_id && msg.brand_id !== rule.match_brand_id) return false;
  // Require at least one matcher to be set, otherwise rule is a no-op
  const hasAnyMatcher =
    !!rule.match_from_contains ||
    !!rule.match_subject_contains ||
    !!rule.match_to_contains ||
    !!rule.match_has_header ||
    !!rule.match_brand_id;
  return hasAnyMatcher;
}

export async function applyRoutingRules(
  supabase: any,
  msg: MessageForRules,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    matched_rule_ids: [],
    applied_label_ids: [],
    applied_category_ids: [],
    archived: false,
    marked_read: false,
    set_urgency: null,
  };

  const { data: rules, error } = await supabase
    .from("routing_rules")
    .select(
      "id, owner_user_id, name, is_active, priority, match_from_contains, match_subject_contains, match_to_contains, match_has_header, match_brand_id, action_add_label_id, action_add_category_id, action_set_urgency, action_mark_read, action_archive, times_matched",
    )
    .eq("owner_user_id", msg.owner_user_id)
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) {
    console.error("apply-rules: failed to load routing_rules", error);
    return result;
  }

  for (const rule of (rules || []) as RuleRow[]) {
    if (!ruleMatches(rule, msg)) continue;
    result.matched_rule_ids.push(rule.id);

    // --- Add label to thread ---
    if (rule.action_add_label_id && msg.thread_id) {
      const { error: tlErr } = await supabase
        .from("thread_labels")
        .upsert(
          {
            thread_id: msg.thread_id,
            label_id: rule.action_add_label_id,
            owner_user_id: msg.owner_user_id,
          },
          { onConflict: "thread_id,label_id" },
        );
      if (!tlErr) result.applied_label_ids.push(rule.action_add_label_id);
      else console.error("apply-rules: thread_labels upsert", tlErr);
    }

    // --- Add brand category to message ---
    if (rule.action_add_category_id) {
      const { error: mcErr } = await supabase
        .from("message_categories")
        .upsert(
          {
            message_id: msg.id,
            category_id: rule.action_add_category_id,
            owner_user_id: msg.owner_user_id,
            detected_via: "rule",
            confidence: 1.0,
          },
          { onConflict: "message_id,category_id" },
        );
      if (!mcErr) result.applied_category_ids.push(rule.action_add_category_id);
      else console.error("apply-rules: message_categories upsert", mcErr);
    }

    // --- Set urgency on the message ---
    if (
      rule.action_set_urgency &&
      ["low", "normal", "high"].includes(rule.action_set_urgency)
    ) {
      const { error: urgErr } = await supabase
        .from("messages")
        .update({ urgency: rule.action_set_urgency })
        .eq("id", msg.id);
      if (!urgErr) result.set_urgency = rule.action_set_urgency;
    }

    // --- Mark read ---
    if (rule.action_mark_read) {
      await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("id", msg.id);
      if (msg.thread_id) {
        await supabase
          .from("threads")
          .update({ unread_count: 0 })
          .eq("id", msg.thread_id);
      }
      result.marked_read = true;
    }

    // --- Archive thread ---
    if (rule.action_archive && msg.thread_id) {
      await supabase
        .from("threads")
        .update({ is_archived: true })
        .eq("id", msg.thread_id);
      result.archived = true;
    }

    // --- Bookkeeping ---
    await supabase
      .from("routing_rules")
      .update({
        times_matched: (rule.times_matched ?? 0) + 1,
        last_matched_at: new Date().toISOString(),
      })
      .eq("id", rule.id);
  }

  return result;
}
