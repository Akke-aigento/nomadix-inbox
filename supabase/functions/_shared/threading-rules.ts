// Pure threading rules — no Deno/npm imports, so vitest can test them
// (src/lib/__tests__/threading-rules.test.ts imports this file directly).

const SUBJECT_PREFIX_RE = /^(re|fwd|aw|antw|tr|fw|r|wg)\s*(\[\d+\])?\s*:\s*/i;
const REPLY_PREFIX_RE = /^\s*(re|aw|antw|fw|fwd|tr|wg)\s*(\[\d+\])?\s*:/i;

export function normalizeSubject(subject: string | null | undefined): string {
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

/** "Re: …", "AW: …", "Fwd: …" — the subject says this answers/forwards something. */
export function isReplySubject(subject: string | null | undefined): boolean {
  return !!subject && REPLY_PREFIX_RE.test(subject);
}

/**
 * Message-IDs from a References / In-Reply-To value, whatever shape it has:
 * a header string ("<a@x> <b@y>"), an array (mailparser), or the JSON string
 * process-message stores in raw_headers for non-string header values.
 */
export function normalizeRefs(input: unknown): string[] {
  if (input == null) return [];
  let values: unknown[] = Array.isArray(input) ? input : [input];
  if (values.length === 1 && typeof values[0] === "string") {
    const s = (values[0] as string).trim();
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) values = parsed;
      } catch {
        /* not JSON — treat as header text */
      }
    }
  }
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    const ids = v.match(/<[^<>\s]+>/g);
    if (ids) out.push(...ids);
    else out.push(...v.split(/[\s,]+/).filter(Boolean));
  }
  return Array.from(new Set(out));
}

type HeaderBag = Map<string, unknown> | Record<string, unknown> | null | undefined;

function header(headers: HeaderBag, key: string): unknown {
  if (!headers) return undefined;
  if (headers instanceof Map) return headers.get(key);
  return (headers as Record<string, unknown>)[key];
}

function headerText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const AUTOMATED_FROM_RE = /(^|[._+-])(no-?reply|do-?not-?reply|notifications?|mailer-daemon|bounces?|automail|alerts?)([._+-]|@)/i;

/**
 * Newsletters, notifications and other machine mail: never threaded on
 * subject alone (two bpost "we zorgen voor je pakje" mails are two parcels).
 */
export function isAutomated(headers: HeaderBag, fromAddress: string | null | undefined): boolean {
  if (header(headers, "list-unsubscribe") != null || header(headers, "list-id") != null) return true;
  const autoSubmitted = headerText(header(headers, "auto-submitted")).trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (/\b(bulk|list|junk)\b/i.test(headerText(header(headers, "precedence")))) return true;
  return !!fromAddress && AUTOMATED_FROM_RE.test(fromAddress.toLowerCase());
}

/** Lower-cased addresses from a to/cc jsonb value ([{address}] or ["a@b"]). */
export function addressList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => (typeof x === "string" ? x : (x as { address?: string } | null)?.address))
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.trim().toLowerCase());
}

export const SUBJECT_FALLBACK_WINDOW_DAYS = 30;

export interface SubjectCandidate {
  thread_id: string | null;
  subject: string | null;
  from_address: string | null;
  to_addresses: unknown;
  received_at: string;
}

/**
 * Subject fallback: pick the thread of the most recent candidate with the same
 * normalized subject and the same counterpart (they sent it, or we sent it to
 * them). Callers only use this for non-automated replies.
 */
export function pickSubjectMatch(
  candidates: SubjectCandidate[],
  normalizedSubject: string,
  counterpart: string,
): string | null {
  const who = counterpart.toLowerCase();
  const sorted = [...candidates].sort(
    (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
  );
  for (const c of sorted) {
    if (!c.thread_id) continue;
    if (normalizeSubject(c.subject) !== normalizedSubject) continue;
    const from = (c.from_address ?? "").toLowerCase();
    if (from === who || addressList(c.to_addresses).includes(who)) return c.thread_id;
  }
  return null;
}
