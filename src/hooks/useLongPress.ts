import { useCallback, useEffect, useRef } from "react";

const HOLD_MS = 450;
const MOVE_TOLERANCE = 10;

/** Lang indrukken op touch. Op een telefoon is er geen hover, dus start dit
 *  gebaar de selectiemodus in de lijst. */
export function useLongPress(enabled: boolean, onLongPress: () => void) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return;
      const touch = e.touches[0];
      origin.current = { x: touch.clientX, y: touch.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        navigator.vibrate?.(15);
        onLongPress();
      }, HOLD_MS);
    },
    [enabled, onLongPress],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const o = origin.current;
      if (!o || timer.current === null) return;
      const touch = e.touches[0];
      if (
        Math.abs(touch.clientX - o.x) > MOVE_TOLERANCE ||
        Math.abs(touch.clientY - o.y) > MOVE_TOLERANCE
      ) {
        clear();
      }
    },
    [clear],
  );

  return { onTouchStart, onTouchMove, onTouchEnd: clear, onTouchCancel: clear };
}
