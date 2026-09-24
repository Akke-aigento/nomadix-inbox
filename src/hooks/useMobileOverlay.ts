import { useEffect, useRef, useState } from "react";

/**
 * Het zichtbare venster: hoogte én verschuiving. Op een telefoon schuift het
 * toetsenbord over de layout heen, en iOS verschuift bovendien het venster als
 * de gebruiker inzoomt. Zonder allebei verdwijnen de knoppen uit beeld.
 */
export function useVisualViewport(
  enabled: boolean,
): { height: number; offsetTop: number } | undefined {
  const [state, setState] = useState<{ height: number; offsetTop: number } | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setState(undefined);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const onChange = () => setState({ height: vv.height, offsetTop: vv.offsetTop });
    onChange();
    vv.addEventListener("resize", onChange);
    vv.addEventListener("scroll", onChange);
    return () => {
      vv.removeEventListener("resize", onChange);
      vv.removeEventListener("scroll", onChange);
    };
  }, [enabled]);

  return state;
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
