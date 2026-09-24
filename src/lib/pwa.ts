import { toast } from "sonner";
import { loadLocale, translate } from "@/i18n/core";

const KILL_SWITCH = "sw=off";

/** Noodrem: /?sw=off meldt de worker af en gooit alle caches leeg. Gebruik
 *  dit als een update blijft hangen; daarna één keer herladen zonder de vlag. */
async function disable(): Promise<void> {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  if (window.location.search.includes(KILL_SWITCH)) {
    void disable();
    return;
  }

  // In dev zou de worker de HMR-stroom van Vite in de weg zitten.
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            // Alleen melden als er al een versie draait: bij de eerste
            // installatie valt er niets te vernieuwen.
            if (next.state !== "installed" || !navigator.serviceWorker.controller) return;
            const locale = loadLocale();
            toast(translate(locale, "inbox.pwa.updateTitle"), {
              duration: Infinity,
              action: {
                label: translate(locale, "inbox.pwa.updateAction"),
                // Pas hier, na de bevestiging, neemt de nieuwe versie over.
                onClick: () => next.postMessage("nomadix:skip-waiting"),
              },
            });
          });
        });
      })
      .catch(() => {
        /* zonder service worker werkt de app gewoon, alleen niet offline */
      });

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });
}
