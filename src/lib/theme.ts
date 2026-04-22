/**
 * Brand color helpers.
 * Brands store `color_primary` as either a hex (#14B8A6) or a CSS color.
 * We expose helpers to apply a brand accent to a subtree by overriding
 * `--brand-accent` on a wrapping element.
 */

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace("#", "");
  if (!HEX_RE.test(`#${m}`)) return null;
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    case bn:
      h = (rn - gn) / d + 4;
      break;
  }
  return [Math.round((h / 6) * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Convert any supported brand color to the HSL triplet string used in CSS vars. */
export function toHslTriplet(color: string | null | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  // Already in "h s% l%" form
  if (/^\d+\s+\d+%\s+\d+%$/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("hsl(")) {
    const inside = trimmed.slice(4, -1);
    return inside.split(",").map((s) => s.trim()).join(" ");
  }
  if (trimmed.startsWith("#")) {
    const rgb = hexToRgb(trimmed);
    if (!rgb) return null;
    const [h, s, l] = rgbToHsl(...rgb);
    return `${h} ${s}% ${l}%`;
  }
  return null;
}

/** Inline style that overrides --brand-accent on a subtree. */
export function brandAccentStyle(
  color: string | null | undefined,
): React.CSSProperties | undefined {
  const hsl = toHslTriplet(color);
  if (!hsl) return undefined;
  return { ["--brand-accent" as any]: hsl } as React.CSSProperties;
}

/** Deterministic pleasant gradient seeded by an email/string — for avatars. */
export function gradientFromSeed(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 38) % 360;
  return `linear-gradient(135deg, hsl(${h1} 65% 45%), hsl(${h2} 70% 35%))`;
}

/** Two-letter initials from a name or email. */
export function initials(name: string | null | undefined, email?: string): string {
  const source = (name || email || "?").trim();
  if (!source) return "?";
  if (source.includes("@")) {
    const local = source.split("@")[0];
    return local.slice(0, 2).toUpperCase();
  }
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
