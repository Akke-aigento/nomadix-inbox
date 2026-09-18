// Pure helpers for the thread view (newest message on top — decision A).

interface Dated {
  id: string;
  received_at: string;
}

/** Newest first; ties broken by id so the order is stable across refetches. */
export function newestFirst<T extends Dated>(messages: T[]): T[] {
  return [...messages].sort((a, b) => {
    const d = new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
    return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Which messages are expanded. Resets to "only the newest" whenever the thread
 * or its newest message changes (a new reply arrived or we just sent one);
 * otherwise keeps what the user opened or closed.
 */
export interface ExpansionState {
  key: string;
  ids: Set<string>;
}

export function nextExpansion(
  prev: ExpansionState | null,
  threadId: string | null,
  newestId: string | null,
): ExpansionState {
  const key = `${threadId ?? ""}:${newestId ?? ""}`;
  if (prev && prev.key === key) return prev;
  return { key, ids: new Set(newestId ? [newestId] : []) };
}

export function toggleExpanded(state: ExpansionState, id: string): ExpansionState {
  const ids = new Set(state.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { key: state.key, ids };
}

const QUOTE_SELECTOR = "blockquote, .gmail_quote, .yahoo_quoted, #appendonsend";

/**
 * Collapse quoted history inside an email body into <details>. Must run on
 * ALREADY SANITIZED html: the only markup it adds is <details>/<summary> with
 * a fixed label. Uses the DOM (not regex) so nested gmail_quote divs stay whole.
 */
export function foldQuotedHtml(html: string, label = "Geciteerde tekst tonen"): string {
  if (!html || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const outermost = Array.from(doc.body.querySelectorAll(QUOTE_SELECTOR)).filter(
    (el) => !el.parentElement?.closest(QUOTE_SELECTOR),
  );
  for (const el of outermost) {
    const details = doc.createElement("details");
    details.className = "quoted";
    const summary = doc.createElement("summary");
    summary.textContent = label;
    details.appendChild(summary);
    el.replaceWith(details);
    details.appendChild(el);
  }
  return doc.body.innerHTML;
}

/** One-line preview for a collapsed message; falls back to the HTML body. */
export function previewText(bodyText: string | null, bodyHtml: string | null, max = 120): string {
  let text = bodyText ?? "";
  if (!text.trim() && bodyHtml) {
    if (typeof DOMParser !== "undefined") {
      const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
      doc.querySelectorAll("style, script, blockquote, .gmail_quote").forEach((n) => n.remove());
      text = doc.body.textContent ?? "";
    } else {
      text = bodyHtml.replace(/<[^>]+>/g, " ");
    }
  }
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}
