// Merkkleur komt uit brands.color_primary in de database — dat is de enige
// bron. (De redesign-branch had een tweede, hardcoded lijst met een slug die
// niet met de seed klopte; die nemen we niet over.)
import type { CSSProperties } from "react";

/** Zet de merkkleur als variabele op een scope: style={brandAccentStyle(hex)} */
export function brandAccentStyle(color?: string | null): CSSProperties {
  if (!color) return {};
  return { ["--brand-accent-raw" as string]: color } as CSSProperties;
}

/** Kleurwaarde voor inline gebruik, met een neutrale terugval. */
export function brandAccentColor(color?: string | null): string {
  return color || "hsl(var(--muted-foreground))";
}

/** Zachte variant van de merkkleur, bv. als achtergrond van een avatar. */
export function brandAccentTint(color?: string | null, percentage = 18): string {
  if (!color) return "hsl(var(--muted))";
  return `color-mix(in srgb, ${color} ${percentage}%, transparent)`;
}
