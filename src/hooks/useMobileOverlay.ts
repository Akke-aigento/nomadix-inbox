import { useEffect, useRef, useState } from "react";

/**
 * Hoogte van het zichtbare deel van het scherm. Op een telefoon schuift het
 * toetsenbord over de layout heen: zonder dit verdwijnen de knoppen eronder.
 */
export function useVisualViewportHeight(enabled: boolean): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setHeight(undefined);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setHeight(vv.height);
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, [enabled]);

  return height;
}

/**
 * Zet een extra history-stap zolang een overlay openstaat. De terugknop van
 * Android (of de veeg terug op iOS) sluit dan de overlay in plaats van het
 * gesprek. Geen eigen route: de opsteller leeft in de staat van ThreadDetail.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const marker = Date.now();
    window.history.pushState({ nomadixOverlay: marker }, "");
    let popped = false;
    const onPop = () => {
      popped = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Sloot de overlay op een andere manier? Ruim onze stap dan zelf op,
      // anders zou de terugknop daarna niets lijken te doen.
      if (!popped && (window.history.state as { nomadixOverlay?: number } | null)?.nomadixOverlay === marker) {
        window.history.back();
      }
    };
  }, [open]);
}
