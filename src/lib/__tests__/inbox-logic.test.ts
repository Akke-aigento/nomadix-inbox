import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTargetIds } from "@/lib/inbox-targets";
import { clearSequence, isSequencePending, startSequence } from "@/lib/key-sequence";
import { pickReplyParent, primaryReplyTarget } from "@/lib/reply-target";

describe("resolveTargetIds", () => {
  it("multi-selection wins", () => {
    expect(resolveTargetIds(new Set(["a", "b"]), "open", "focused")).toEqual(["a", "b"]);
  });

  it("open thread wins over the focused row (IA-5)", () => {
    expect(resolveTargetIds(new Set(), "open", "focused")).toEqual(["open"]);
  });

  it("falls back to the focused row, then nothing", () => {
    expect(resolveTargetIds(new Set(), null, "focused")).toEqual(["focused"]);
    expect(resolveTargetIds(new Set(), null, null)).toEqual([]);
  });
});

describe("key-sequence", () => {
  afterEach(() => {
    clearSequence();
    vi.useRealTimers();
  });

  it("is pending after start and cleared explicitly", () => {
    expect(isSequencePending()).toBe(false);
    startSequence();
    expect(isSequencePending()).toBe(true);
    clearSequence();
    expect(isSequencePending()).toBe(false);
  });

  it("expires on its own", () => {
    vi.useFakeTimers();
    startSequence();
    vi.advanceTimersByTime(1499);
    expect(isSequencePending()).toBe(true);
    vi.advanceTimersByTime(2);
    expect(isSequencePending()).toBe(false);
  });
});

describe("primaryReplyTarget (THR-1)", () => {
  it("replies to the sender of an incoming message", () => {
    expect(primaryReplyTarget({ from_address: "klant@x.be", is_outbound: false })).toEqual([
      "klant@x.be",
    ]);
  });

  it("honours Reply-To", () => {
    expect(
      primaryReplyTarget({ from_address: "noreply@x.be", reply_to: "Hulp <hulp@x.be>" }),
    ).toEqual(["hulp@x.be"]);
  });

  it("follows up with the original recipients of our own sent message", () => {
    expect(
      primaryReplyTarget({
        from_address: "info@vanxcel.com",
        is_outbound: true,
        to_addresses: [{ address: "klant@x.be", name: "Klant" }],
      }),
    ).toEqual(["klant@x.be"]);
  });

  it("falls back to the sender when an outbound message has no recipients", () => {
    expect(
      primaryReplyTarget({ from_address: "info@vanxcel.com", is_outbound: true, to_addresses: [] }),
    ).toEqual(["info@vanxcel.com"]);
  });
});

describe("pickReplyParent (THR-1)", () => {
  const msg = (id: string, at: string, is_outbound = false) => ({ id, received_at: at, is_outbound });

  it("picks the newest incoming message, skipping our own reply", () => {
    const list = [
      msg("in-1", "2026-09-01T10:00:00Z"),
      msg("in-2", "2026-09-02T10:00:00Z"),
      msg("out-1", "2026-09-03T10:00:00Z", true),
    ];
    expect(pickReplyParent(list)?.id).toBe("in-2");
  });

  it("does not depend on input order", () => {
    const list = [msg("in-2", "2026-09-02T10:00:00Z"), msg("in-1", "2026-09-01T10:00:00Z")];
    expect(pickReplyParent(list)?.id).toBe("in-2");
  });

  it("falls back to the newest message when everything is outbound", () => {
    const list = [msg("out-1", "2026-09-01T10:00:00Z", true), msg("out-2", "2026-09-02T10:00:00Z", true)];
    expect(pickReplyParent(list)?.id).toBe("out-2");
  });
});
