/**
 * Nomadix motion language.
 * Centralised easing/duration/stagger so the chrome animates with one voice.
 */

import type { Transition, Variants } from "framer-motion";

export const ease = {
  /** snappy perceived-out — default for entrances */
  out: [0.16, 1, 0.3, 1] as const,
  /** balanced in/out for popovers */
  inOut: [0.65, 0, 0.35, 1] as const,
  /** gentle natural spring (no overshoot) */
  spring: { type: "spring" as const, stiffness: 300, damping: 30 },
  /** bouncy spring — reserve for the compose FAB only */
  bouncy: { type: "spring" as const, stiffness: 380, damping: 22 },
} as const;

export const duration = {
  micro: 0.15,
  standard: 0.25,
  showcase: 0.4,
  hero: 0.6,
} as const;

export const stagger = {
  fast: 0.02,
  normal: 0.04,
  slow: 0.08,
} as const;

/* ── Common variants ────────────────────────────────── */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.standard, ease: ease.out },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: duration.standard, ease: ease.out },
  },
};

export const heroReveal: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.hero, ease: ease.out },
  },
};

export const listContainer = (s: number = stagger.fast): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: s, delayChildren: 0.04 },
  },
});

export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 4 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: duration.standard, ease: ease.out },
  },
};

export const sheetUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.showcase, ease: ease.out },
  },
};

/* ── Reduced-motion helper ──────────────────────────── */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Strip transforms when reduced motion is on, keep opacity. */
export function safeTransition(t: Transition): Transition {
  if (!prefersReducedMotion()) return t;
  return { duration: 0.15 };
}
