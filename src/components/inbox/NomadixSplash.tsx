import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { duration, ease } from "@/lib/motion";

const STORAGE_KEY = "nomadix:splash:seen";

/**
 * One-time typographic splash. Shows on the first app load per session,
 * then fades out and renders nothing on subsequent renders.
 */
export function NomadixSplash() {
  const [visible, setVisible] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(STORAGE_KEY) !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
      setVisible(false);
    }, 1100);
    return () => window.clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-canvas"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.showcase, ease: ease.out }}
        >
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: [0, 1, 1, 0.6], y: 0 }}
            transition={{
              duration: 1.0,
              ease: ease.out,
              times: [0, 0.25, 0.7, 1],
            }}
            className="font-display text-text-primary"
            style={{
              fontSize: "clamp(3rem, 8vw, 5.5rem)",
              fontVariationSettings: '"opsz" 144, "wght" 400',
              letterSpacing: "-0.035em",
              fontStyle: "italic",
            }}
          >
            Nomadix
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
