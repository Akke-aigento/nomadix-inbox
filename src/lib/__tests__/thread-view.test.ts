import { describe, expect, it } from "vitest";
import {
  foldQuotedHtml,
  newestFirst,
  nextExpansion,
  previewText,
  toggleExpanded,
} from "@/lib/thread-view";
import { pickReplyParent, primaryReplyTarget } from "@/lib/reply-target";

const msg = (id: string, at: string, extra: Record<string, unknown> = {}) => ({
  id,
  received_at: at,
  ...extra,
});

describe("newestFirst", () => {
  it("puts the newest message on top", () => {
    const out = newestFirst([
      msg("a", "2026-09-01T10:00:00Z"),
      msg("c", "2026-09-03T10:00:00Z"),
      msg("b", "2026-09-02T10:00:00Z"),
    ]);
    expect(out.map((m) => m.id)).toEqual(["c", "b", "a"]);
  });

  it("is stable on equal timestamps", () => {
    const at = "2026-09-01T10:00:00Z";
    expect(newestFirst([msg("b", at), msg("a", at)]).map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("expansion (newest open, older closed)", () => {
  it("starts with only the newest expanded", () => {
    const s = nextExpansion(null, "t1", "m3");
    expect([...s.ids]).toEqual(["m3"]);
  });

  it("keeps user toggles while nothing new arrives", () => {
    let s = nextExpansion(null, "t1", "m3");
    s = toggleExpanded(s, "m1");
    s = nextExpansion(s, "t1", "m3");
    expect(s.ids.has("m1")).toBe(true);
    expect(s.ids.has("m3")).toBe(true);
  });

  it("resets to the new top message when a message lands on top", () => {
    let s = nextExpansion(null, "t1", "m3");
    s = toggleExpanded(s, "m1");
    s = nextExpansion(s, "t1", "sent-1");
    expect([...s.ids]).toEqual(["sent-1"]);
  });

  it("resets when switching threads", () => {
    const s = nextExpansion(nextExpansion(null, "t1", "m3"), "t2", "x9");
    expect([...s.ids]).toEqual(["x9"]);
  });

  it("can collapse the newest too", () => {
    const s = toggleExpanded(nextExpansion(null, "t1", "m3"), "m3");
    expect(s.ids.size).toBe(0);
  });
});

describe("foldQuotedHtml", () => {
  it("wraps a blockquote in a closed <details>", () => {
    const out = foldQuotedHtml("<p>Hoi</p><blockquote><p>oud</p></blockquote>");
    const doc = new DOMParser().parseFromString(out, "text/html");
    const details = doc.querySelector("details.quoted");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(details?.querySelector("summary")?.textContent).toBe("Geciteerde tekst tonen");
    expect(details?.querySelector("blockquote")?.textContent).toBe("oud");
    expect(doc.body.firstElementChild?.textContent).toBe("Hoi");
  });

  it("keeps a nested gmail_quote whole (old regex stopped at the first </div>)", () => {
    const html =
      '<div>Antwoord</div><div class="gmail_quote"><div>Op ma schreef X:</div><div>deel 2</div></div>';
    const doc = new DOMParser().parseFromString(foldQuotedHtml(html), "text/html");
    const details = doc.querySelectorAll("details.quoted");
    expect(details).toHaveLength(1);
    expect(details[0].textContent).toContain("deel 2");
  });

  it("only wraps the outermost quote", () => {
    const html = "<blockquote>a<blockquote>b</blockquote></blockquote>";
    const doc = new DOMParser().parseFromString(foldQuotedHtml(html), "text/html");
    expect(doc.querySelectorAll("details")).toHaveLength(1);
  });
});

describe("previewText", () => {
  it("uses body_text when present", () => {
    expect(previewText("  Hallo\n  daar ", "<p>x</p>")).toBe("Hallo daar");
  });

  it("falls back to the HTML (outbound messages have no body_text), without quotes", () => {
    expect(previewText(null, "<p>Bedankt!</p><blockquote>oude mail</blockquote>")).toBe("Bedankt!");
  });
});

describe("reply target with newest-first input (INBOX-1b must not regress)", () => {
  it("still answers the newest incoming message when our reply is on top", () => {
    const list = newestFirst([
      msg("in-1", "2026-09-01T10:00:00Z", { is_outbound: false }),
      msg("out-1", "2026-09-02T10:00:00Z", { is_outbound: true }),
    ]);
    expect(list[0].id).toBe("out-1");
    expect(pickReplyParent(list)?.id).toBe("in-1");
  });

  it("replying on our own sent message (card button) goes to its recipients", () => {
    expect(
      primaryReplyTarget({
        from_address: "info@toog.app",
        is_outbound: true,
        to_addresses: [{ address: "klant@x.be" }],
      }),
    ).toEqual(["klant@x.be"]);
  });
});
