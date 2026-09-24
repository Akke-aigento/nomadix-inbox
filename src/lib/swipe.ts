// Veegregels voor een rij in de lijst. Puur rekenwerk, zodat de drempels
// getest kunnen worden zonder touch-events na te bootsen.

export type SwipeAction = "archive" | "actions" | "toggleRead";

/** Beweging in px voordat we van "scrollen" naar "vegen" omschakelen. */
export const SWIPE_START = 12;
/** Vanaf hier is er genoeg zichtbaar om iets te betekenen. */
export const SWIPE_REVEAL = 72;
/** Verder dan de helft van de rij: meteen uitvoeren, niet meer bevestigen. */
export const SWIPE_COMMIT_RATIO = 0.5;

/** Wat er gebeurt als de vinger nú loslaat. `null` = terugveren. */
export function resolveSwipe(dx: number, width: number): SwipeAction | null {
  const commit = Math.max(SWIPE_REVEAL * 2, width * SWIPE_COMMIT_RATIO);
  if (dx <= -commit) return "archive";
  if (dx <= -SWIPE_REVEAL) return "actions";
  if (dx >= SWIPE_REVEAL) return "toggleRead";
  return null;
}

/** Weerstand voorbij het omslagpunt: de rij blijft volgen, maar trager,
 *  zodat het einde van de veeg voelbaar is zonder hem te blokkeren. */
export function dampen(dx: number, width: number): number {
  const max = width * 0.8;
  const abs = Math.abs(dx);
  if (abs <= max) return dx;
  const over = abs - max;
  return Math.sign(dx) * (max + over * 0.25);
}

/** Alleen horizontaal genoeg bewogen telt als veeg; anders blijft het scrollen. */
export function isHorizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_START && Math.abs(dx) > Math.abs(dy) * 1.5;
}
