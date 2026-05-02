import { animate } from "motion";

const BRANDS: Record<string, string> = {
  vanxcel:       "oklch(72% 0.18 230)",
  loveke:        "oklch(75% 0.22 350)",
  "studio-akke": "oklch(78% 0.16 75)",
  aigento:       "oklch(70% 0.20 280)",
  sellqo:        "oklch(72% 0.18 200)",
  toog:          "oklch(76% 0.20 50)",
  mancini:       "oklch(82% 0.10 80)",
  defiere:       "oklch(72% 0.16 145)",
};

const DEFAULT_ACCENT = "oklch(70% 0.20 280)";

/**
 * Smoothly transition the global --accent-glow CSS variable when the user
 * switches between brands. CSS variables can't be transitioned directly
 * across all browsers, so we animate via JS.
 */
export function setBrandAccent(brandSlug: string | null) {
  const target = brandSlug ? BRANDS[brandSlug] ?? DEFAULT_ACCENT : DEFAULT_ACCENT;
  const root = document.documentElement;

  if (brandSlug) root.dataset.brand = brandSlug;
  else delete root.dataset.brand;

  animate(
    root,
    { "--accent-glow": target } as Record<string, string>,
    { duration: 0.4, ease: [0.32, 0.72, 0, 1] }
  );
}

export function getBrandSlug(brandName: string | null): string | null {
  if (!brandName) return null;
  return brandName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
