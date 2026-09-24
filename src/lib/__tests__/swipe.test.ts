import { describe, expect, it } from "vitest";
import {
  SWIPE_REVEAL,
  dampen,
  isHorizontal,
  resolveSwipe,
} from "../swipe";

const WIDTH = 390;

describe("resolveSwipe", () => {
  it("veert terug bij een korte beweging", () => {
    expect(resolveSwipe(-20, WIDTH)).toBeNull();
    expect(resolveSwipe(20, WIDTH)).toBeNull();
    expect(resolveSwipe(0, WIDTH)).toBeNull();
  });

  it("toont knoppen bij een korte veeg naar links", () => {
    expect(resolveSwipe(-SWIPE_REVEAL, WIDTH)).toBe("actions");
    expect(resolveSwipe(-120, WIDTH)).toBe("actions");
  });

  it("verwijdert pas voorbij de helft van de rij", () => {
    expect(resolveSwipe(-194, WIDTH)).toBe("actions");
    expect(resolveSwipe(-195, WIDTH)).toBe("delete");
    expect(resolveSwipe(-380, WIDTH)).toBe("delete");
  });

  it("houdt op een smalle rij minstens twee keer de knoppendrempel aan", () => {
    // Anders zou op een smal scherm één korte veeg al verwijderen.
    expect(resolveSwipe(-100, 200)).toBe("actions");
    expect(resolveSwipe(-SWIPE_REVEAL * 2, 200)).toBe("delete");
  });

  it("wisselt gelezen/ongelezen bij een veeg naar rechts", () => {
    expect(resolveSwipe(SWIPE_REVEAL, WIDTH)).toBe("toggleRead");
    expect(resolveSwipe(300, WIDTH)).toBe("toggleRead");
  });
});

describe("dampen", () => {
  it("volgt de vinger binnen het bereik", () => {
    expect(dampen(-100, WIDTH)).toBe(-100);
    expect(dampen(50, WIDTH)).toBe(50);
  });

  it("remt af voorbij 80% van de breedte", () => {
    const max = WIDTH * 0.8;
    expect(dampen(-(max + 100), WIDTH)).toBeCloseTo(-(max + 25));
    expect(Math.abs(dampen(-(max + 100), WIDTH))).toBeLessThan(max + 100);
  });
});

describe("isHorizontal", () => {
  it("laat verticaal scrollen met rust", () => {
    expect(isHorizontal(8, 40)).toBe(false);
    expect(isHorizontal(30, 40)).toBe(false);
  });

  it("herkent een duidelijke horizontale beweging", () => {
    expect(isHorizontal(-40, 5)).toBe(true);
    expect(isHorizontal(40, 10)).toBe(true);
  });
});
