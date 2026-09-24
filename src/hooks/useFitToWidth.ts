import { useCallback, useEffect, useRef, useState } from "react";

/** Onder deze factor wordt de tekst onleesbaar; dan liever laten scrollen. */
const MIN_SCALE = 0.4;

/**
 * Past een te brede HTML-mail op de schermbreedte, zoals Gmail en Apple Mail
 * dat doen: de opmaak blijft heel, alleen kleiner. Inzoomen doe je met je
 * vingers — daarom staat `user-scalable` ook nergens uit.
 *
 * Gebruikt `zoom` en niet `transform: scale()`. Een transform rastert de
 * tekst één keer op de geschaalde grootte (wazig, en op iOS ook tijdens het
 * scrollen); `zoom` laat de browser de tekst gewoon opnieuw uitrekenen.
 */
export function useFitToWidth<T extends HTMLElement>(enabled: boolean, content: unknown) {
  const ref = useRef<T | null>(null);
  const [scale, setScale] = useState(1);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled) {
      el.style.zoom = "";
      setScale(1);
      return;
    }
    // Eerst terug naar ware grootte: anders meet je je eigen verkleining mee.
    el.style.zoom = "";
    const natural = el.scrollWidth;
    const available = el.clientWidth;
    if (!natural || !available) return;
    const factor = available / natural;
    const next = factor >= 0.995 ? 1 : Math.max(MIN_SCALE, factor);
    el.style.zoom = next === 1 ? "" : String(next);
    setScale(next);
  }, [enabled]);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;

    // Beelden komen later binnen en veranderen de breedte alsnog.
    const images = Array.from(el.querySelectorAll("img"));
    const onLoad = () => measure();
    images.forEach((img) => {
      if (!img.complete) {
        img.addEventListener("load", onLoad);
        img.addEventListener("error", onLoad);
      }
    });

    const ro =
      typeof ResizeObserver !== "undefined" && el.parentElement
        ? new ResizeObserver(() => measure())
        : null;
    if (ro && el.parentElement) ro.observe(el.parentElement);
    window.addEventListener("orientationchange", onLoad);

    return () => {
      images.forEach((img) => {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onLoad);
      });
      ro?.disconnect();
      window.removeEventListener("orientationchange", onLoad);
    };
  }, [measure, content]);

  return { ref, scale, remeasure: measure };
}
