// Dichtheid van de lijst. Stond in InboxPage; nu gedeeld, zodat Instellingen >
// Voorkeuren dezelfde waarde kan zetten. Zelfde localStorage-patroon als eerst.
import { useCallback, useEffect, useState } from "react";

export type Density = "comfortable" | "compact" | "dense";

export const DENSITY_KEY = "inbox.density";
const EVENT = "nomadix:density";

export function loadDensity(): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === "compact" || v === "dense" || v === "comfortable") return v;
  } catch {
    /* opslag geblokkeerd */
  }
  return "comfortable";
}

export function useDensity(): [Density, (d: Density | ((prev: Density) => Density)) => void] {
  const [density, setDensityState] = useState<Density>(() => loadDensity());

  // Twee schermen kunnen de waarde tegelijk tonen (lijst + voorkeuren).
  useEffect(() => {
    const onChange = (e: Event) => setDensityState((e as CustomEvent<Density>).detail);
    window.addEventListener(EVENT, onChange as EventListener);
    return () => window.removeEventListener(EVENT, onChange as EventListener);
  }, []);

  const setDensity = useCallback((d: Density | ((prev: Density) => Density)) => {
    setDensityState((prev) => {
      const next = typeof d === "function" ? d(prev) : d;
      try {
        localStorage.setItem(DENSITY_KEY, next);
      } catch {
        /* opslag geblokkeerd */
      }
      window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
      return next;
    });
  }, []);

  return [density, setDensity];
}
