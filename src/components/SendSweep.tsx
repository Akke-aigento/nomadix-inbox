/**
 * SendSweep
 * ──────────
 * One of the Phase 3E "delight moments". When a message is sent, a thin
 * teal progress line sweeps left-to-right across the very top of the screen.
 *
 * Triggered globally via `triggerSendSweep()`, dispatched from the composer.
 * Listens for the `nomadix:sent` window event so any sender can fire it.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const EVENT = "nomadix:sent";

/** Dispatch the global sweep — call this right after a successful send. */
export function triggerSendSweep() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function SendSweep() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let timer: number | null = null;
    const handler = () => {
      setActive(true);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setActive(false), 700);
    };
    window.addEventListener(EVENT, handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="send-sweep"
          aria-hidden
          className="pointer-events-none fixed left-0 right-0 top-0 z-[100] h-[2px]"
          initial={{ scaleX: 0, opacity: 1, transformOrigin: "left center" }}
          animate={{ scaleX: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ scaleX: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.2, delay: 0.5 } }}
          style={{
            background:
              "linear-gradient(90deg, transparent, hsl(var(--accent-teal)) 30%, hsl(var(--accent-cyan)) 70%, transparent)",
            boxShadow: "0 0 12px hsl(var(--accent-teal) / 0.6)",
          }}
        />
      )}
    </AnimatePresence>
  );
}
