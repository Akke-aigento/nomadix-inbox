import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { nl, type MessageKey } from "@/i18n/nl";
import { translate } from "@/i18n";
import { fmtDate, fmtDateTime, fmtListTime, fmtNumber } from "@/i18n/format";

const VARS = /\{(\w+)\}/g;
const varsOf = (s: string) => [...s.matchAll(VARS)].map((m) => m[1]).sort();

describe("woordenboek-pariteit", () => {
  it("elke sleutel bestaat in beide talen", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(nl).sort());
  });

  it("geen lege vertalingen", () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim(), `en.${key} is leeg`).not.toBe("");
    }
    for (const [key, value] of Object.entries(nl)) {
      expect(value.trim(), `nl.${key} is leeg`).not.toBe("");
    }
  });

  it("dezelfde {variabelen} per sleutel", () => {
    for (const key of Object.keys(nl) as MessageKey[]) {
      expect(varsOf(en[key]), `variabelen wijken af bij '${key}'`).toEqual(varsOf(nl[key]));
    }
  });
});

describe("translate", () => {
  it("geeft de vertaling van de gekozen taal", () => {
    expect(translate("nl", "common.save")).toBe("Opslaan");
    expect(translate("en", "common.save")).toBe("Save");
  });

  it("vult variabelen in", () => {
    expect(translate("nl", "common.save" as MessageKey, { x: 1 })).toBe("Opslaan");
  });

  it("valt terug op Nederlands bij een onbekende taal", () => {
    expect(translate("de" as never, "common.cancel")).toBe("Annuleren");
  });
});

describe("datum en getallen volgen de taal", () => {
  const d = new Date("2026-03-09T08:05:00Z");

  it("maandnaam verschilt per taal", () => {
    expect(fmtDate(d, "nl")).toMatch(/mrt/i);
    expect(fmtDate(d, "en")).toMatch(/mar/i);
  });

  it("dag + tijd", () => {
    expect(fmtDateTime(d, "nl")).toMatch(/^maa 9 mrt/i);
    expect(fmtDateTime(d, "en")).toMatch(/^mon 9 mar/i);
  });

  it("lijsttijd valt terug op het meegegeven woord voor gisteren", () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    expect(fmtListTime(yesterday, "nl", "Gisteren")).toBe("Gisteren");
  });

  it("getallen met de juiste scheiding", () => {
    expect(fmtNumber(1234, "nl")).toBe("1.234");
    expect(fmtNumber(1234, "en")).toBe("1,234");
  });
});

// Lovable regenereert src/integrations/supabase/types.ts. Die generatie kent
// onze handgeschreven RPC-entries niet, en zonder deze test verdwijnen ze stil
// — waarna de threadlijst en de sidebar-tellers alleen nog via `as any` werken.
describe("types.ts houdt de handmatige RPC-entries", () => {
  const types = readFileSync(
    resolve(__dirname, "../../integrations/supabase/types.ts"),
    "utf8",
  );

  it("thread_list staat in Functions", () => {
    expect(types).toContain("thread_list:");
    expect(types).toContain("p_brand_ids");
    expect(types).toContain("p_category_ids");
  });

  it("sidebar_counts staat in Functions", () => {
    expect(types).toContain("sidebar_counts:");
  });
});
