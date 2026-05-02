import type { Transition, Variants } from "motion/react";

export const ease = {
  smooth: [0.32, 0.72, 0, 1] as const,
  swift:  [0.4, 0, 0.2, 1] as const,
} as const;

export const springs = {
  default: { type: "spring", damping: 28, stiffness: 320 } satisfies Transition,
  snappy:  { type: "spring", damping: 22, stiffness: 400 } satisfies Transition,
  gentle:  { type: "spring", damping: 32, stiffness: 220 } satisfies Transition,
} as const;

export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.36, ease: ease.smooth } },
};

export const slideUp: Variants = {
  hidden:  { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: ease.smooth } },
};

export const slideInLeft: Variants = {
  hidden:  { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.28, ease: ease.smooth } },
};

/** Stagger container for thread list rows */
export const staggerContainer: Variants = {
  hidden:  { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.05 },
  },
};

export const threadRowItem: Variants = slideUp;
