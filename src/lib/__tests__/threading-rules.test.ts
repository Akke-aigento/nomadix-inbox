// Tests for the edge-function threading rules (pure module, no Deno imports).
import { describe, expect, it } from "vitest";
import {
  isAutomated,
  isReplySubject,
  normalizeRefs,
  normalizeSubject,
  pickSubjectMatch,
} from "../../../supabase/functions/_shared/threading-rules";

describe("normalizeSubject / isReplySubject", () => {
  it("strips stacked prefixes, incl. [n] counters", () => {
    expect(normalizeSubject("Re: AW: Fwd[2]: Offerte Q3")).toBe("offerte q3");
  });

  it("recognises replies/forwards", () => {
    expect(isReplySubject("Re: pakje")).toBe(true);
    expect(isReplySubject("Antw: pakje")).toBe(true);
    expect(isReplySubject("We zorgen voor je pakje")).toBe(false);
    expect(isReplySubject("Rekening voor re: voeding")).toBe(false);
  });
});

describe("normalizeRefs", () => {
  it("header text", () => {
    expect(normalizeRefs("<a@x> <b@y>")).toEqual(["<a@x>", "<b@y>"]);
  });

  it("mailparser array", () => {
    expect(normalizeRefs(["<a@x>", "<b@y>"])).toEqual(["<a@x>", "<b@y>"]);
  });

  it("JSON string from raw_headers (send-email used to split this on spaces)", () => {
    expect(normalizeRefs('["<a@x>","<b@y>"]')).toEqual(["<a@x>", "<b@y>"]);
  });

  it("dedupes and ignores empty input", () => {
    expect(normalizeRefs("<a@x> <a@x>")).toEqual(["<a@x>"]);
    expect(normalizeRefs(undefined)).toEqual([]);
    expect(normalizeRefs("")).toEqual([]);
  });
});

describe("isAutomated", () => {
  it("list headers", () => {
    expect(isAutomated(new Map([["list-unsubscribe", "<mailto:x>"]]), "news@x.be")).toBe(true);
    expect(isAutomated({ "list-id": "x" }, "a@x.be")).toBe(true);
  });

  it("auto-submitted / precedence", () => {
    expect(isAutomated({ "auto-submitted": "auto-generated" }, "a@x.be")).toBe(true);
    expect(isAutomated({ "auto-submitted": "no" }, "a@x.be")).toBe(false);
    expect(isAutomated({ precedence: "bulk" }, "a@x.be")).toBe(true);
  });

  it("noreply-style senders", () => {
    expect(isAutomated({}, "no-reply@bpost.be")).toBe(true);
    expect(isAutomated({}, "notifications@github.com")).toBe(true);
    expect(isAutomated({}, "automail@bol.com")).toBe(true);
    expect(isAutomated({}, "jan.peeters@klant.be")).toBe(false);
  });
});

describe("pickSubjectMatch", () => {
  const c = (thread_id: string, from: string, to: string[], at: string, subject = "Offerte") => ({
    thread_id,
    subject,
    from_address: from,
    to_addresses: to.map((address) => ({ address })),
    received_at: at,
  });

  it("matches our own sent mail to the same counterpart", () => {
    const cands = [c("t1", "info@vanxcel.com", ["klant@x.be"], "2026-09-10T10:00:00Z", "Re: Offerte")];
    expect(pickSubjectMatch(cands, "offerte", "klant@x.be")).toBe("t1");
  });

  it("does not match a different counterpart with the same subject", () => {
    const cands = [c("t1", "ander@y.be", ["info@vanxcel.com"], "2026-09-10T10:00:00Z")];
    expect(pickSubjectMatch(cands, "offerte", "klant@x.be")).toBeNull();
  });

  it("prefers the most recent matching thread", () => {
    const cands = [
      c("old", "klant@x.be", [], "2026-09-01T10:00:00Z"),
      c("new", "klant@x.be", [], "2026-09-12T10:00:00Z"),
    ];
    expect(pickSubjectMatch(cands, "offerte", "KLANT@x.be")).toBe("new");
  });
});
