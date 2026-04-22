/**
 * BrandAccentRoot
 * ────────────────
 * Watches the active brand filter and animates the global `--brand-accent`
 * CSS variable on the `<html>` element. The whole chrome subtly cross-fades
 * to that brand's hue (150ms) and back to teal when the filter is cleared.
 *
 * Implementation:
 *   - Reads `useInboxFilters().filters.brands` (single brand → that brand)
 *   - Resolves brand → color_primary via useBrandsQuery
 *   - Animates between two HSL triplets via requestAnimationFrame, since
 *     CSS `transition` cannot animate custom properties without
 *     `@property` registration (and we want broad browser support).
 */
import { useEffect, useRef } from "react";
import { useInboxFilters } from "@/hooks/useInboxFilters";
import { useBrandsQuery } from "@/hooks/useThreadsQuery";
import { toHslTriplet } from "@/lib/theme";

const TEAL_TRIPLET = "174 80% 40%";

function parseTriplet(t: string): [number, number, number] | null {
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpHue(a: number, b: number, t: number) {
  // shortest-arc hue interpolation
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return ((a + d * t) % 360 + 360) % 360;
}

export function BrandAccentRoot() {
  const { filters } = useInboxFilters();
  const { data: brands = [] } = useBrandsQuery();
  const rafRef = useRef<number | null>(null);
  const currentRef = useRef<[number, number, number]>(parseTriplet(TEAL_TRIPLET)!);

  useEffect(() => {
    let target = TEAL_TRIPLET;
    if (filters.brands.length === 1) {
      const slug = filters.brands[0];
      const brand = (brands as any[]).find((b) => b.slug === slug);
      const hsl = toHslTriplet(brand?.color_primary);
      if (hsl) target = hsl;
    }
    const targetVals = parseTriplet(target);
    if (!targetVals) return;

    const fromVals: [number, number, number] = [...currentRef.current];
    const start = performance.now();
    const duration = 350; // ms — slightly longer than 150 so it reads as a deliberate hue shift
    const root = document.documentElement;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out
      const eased = 1 - Math.pow(1 - t, 3);
      const h = lerpHue(fromVals[0], targetVals[0], eased);
      const s = lerp(fromVals[1], targetVals[1], eased);
      const l = lerp(fromVals[2], targetVals[2], eased);
      currentRef.current = [h, s, l];
      root.style.setProperty(
        "--brand-accent",
        `${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%`,
      );
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [filters.brands, brands]);

  return null;
}
