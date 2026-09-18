// Pure helpers for "who does a reply go to?". Kept out of ReplyComposer so
// they can be unit-tested.

interface ReplyableMessage {
  from_address: string;
  to_addresses?: unknown;
  reply_to?: unknown;
  is_outbound?: boolean | null;
}

export function addressesToList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => (typeof x === "string" ? x : (x as { address?: string })?.address))
    .filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** Extract e-mail addresses from a Reply-To value (string, comma list, or array). */
export function parseReplyTo(input: unknown): string[] {
  if (!input) return [];
  const raw = Array.isArray(input)
    ? input
        .map((x) => (typeof x === "string" ? x : (x as { address?: string })?.address))
        .filter(Boolean)
        .join(",")
    : typeof input === "string"
      ? input
      : typeof (input as { address?: unknown })?.address === "string"
        ? (input as { address: string }).address
        : "";
  const matches = String(raw).match(/[^\s<>,;"]+@[^\s<>,;"]+\.[^\s<>,;"]+/g);
  return matches ? Array.from(new Set(matches.map((m) => m.trim()))) : [];
}

/**
 * Primary recipient for a reply.
 * - Our own sent message: follow up with the people we sent it to — replying
 *   to its sender would mail ourselves.
 * - Otherwise: Reply-To when present, else the sender.
 */
export function primaryReplyTarget(parent: ReplyableMessage): string[] {
  if (parent.is_outbound) {
    const original = addressesToList(parent.to_addresses);
    if (original.length) return original;
  }
  const rt = parseReplyTo(parent.reply_to);
  return rt.length ? rt : [parent.from_address];
}

/**
 * The message a thread-level reply ("r", header button) answers: the newest
 * incoming message, falling back to the newest message of any kind.
 * Input order does not matter.
 */
export function pickReplyParent<T extends { received_at: string; is_outbound?: boolean | null }>(
  messages: T[],
): T | undefined {
  const byNewest = [...messages].sort(
    (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
  );
  return byNewest.find((m) => !m.is_outbound) ?? byNewest[0];
}
